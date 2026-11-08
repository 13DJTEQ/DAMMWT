"""Ensure DAM localhost API is up (handlers only — never during register())."""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from .http_client import DamHttpError, dam_request, resolve_base_url, resolve_dammwt_root


def probe_health(settings: dict[str, Any] | None = None, *, timeout: float = 3.0) -> dict[str, Any]:
    return dam_request(
        "GET",
        "/v1/health",
        auth=False,
        settings=settings,
        timeout=timeout,
    )


def _spawn_detached(cmd: list[str], *, cwd: str | None) -> int | None:
    """Best-effort background launch; returns PID when known."""
    popen_kwargs: dict[str, Any] = {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "stdin": subprocess.DEVNULL,
        "start_new_session": True,
    }
    if cwd:
        popen_kwargs["cwd"] = cwd
    env = os.environ.copy()
    proc = subprocess.Popen(cmd, env=env, **popen_kwargs)
    return proc.pid


def _parse_json_blob(text: str) -> dict[str, Any] | None:
    text = (text or "").strip()
    if not text:
        return None
    # Prefer last JSON object in the stream (npm may print script banners).
    for chunk in reversed(text.splitlines()):
        line = chunk.strip()
        if not line.startswith("{"):
            continue
        try:
            data = json.loads(line)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            continue
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def _ensure_via_cli(
    root: str,
    *,
    timeout_sec: float,
    launch: bool,
) -> dict[str, Any] | None:
    """Prefer shared `npm run dam:ensure` when scripts/dam-ensure.mjs exists."""
    script = Path(root) / "scripts" / "dam-ensure.mjs"
    if not script.is_file():
        return None
    cmd = ["npm", "run", "dam:ensure", "--prefix", root, "--"]
    # dam:ensure uses ms; plugin uses seconds.
    cmd.extend(["--timeout", str(int(max(timeout_sec, 1) * 1000))])
    if not launch:
        cmd.append("--no-launch")
    env = os.environ.copy()
    env["DAMMWT_ROOT"] = root
    try:
        proc = subprocess.run(
            cmd,
            cwd=root,
            env=env,
            capture_output=True,
            text=True,
            timeout=max(timeout_sec, 5) + 30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {
            "ok": False,
            "code": "DAM_ENSURE_CLI",
            "error": f"dam:ensure failed to run: {exc}",
            "dammwtRoot": root,
            "via": "dam:ensure",
        }

    combined = "\n".join(x for x in (proc.stdout, proc.stderr) if x)
    parsed = _parse_json_blob(combined) or {}
    out: dict[str, Any] = {
        "ok": proc.returncode == 0,
        "via": "dam:ensure",
        "exitCode": proc.returncode,
        "dammwtRoot": root,
        **parsed,
    }
    if proc.returncode != 0 and "error" not in out and "reason" in parsed:
        out["error"] = parsed.get("reason")
    if proc.returncode != 0 and "error" not in out:
        out["error"] = (proc.stderr or proc.stdout or f"dam:ensure exited {proc.returncode}")[
            :500
        ]
    return out


def _launch_candidates(root: str) -> list[tuple[str, list[str]]]:
    """Ordered (label, argv) launch attempts (fallback when CLI missing)."""
    root_path = Path(root)
    candidates: list[tuple[str, list[str]]] = []
    launch_cmd = root_path / "scripts" / "launch-dam.command"
    if launch_cmd.is_file():
        candidates.append(("launch-dam.command", ["bash", str(launch_cmd)]))
    review = root_path / "scripts" / "review-electron.sh"
    if review.is_file():
        candidates.append(("review:electron", ["npm", "run", "review:electron", "--prefix", root]))
    else:
        candidates.append(("npm start", ["npm", "start", "--prefix", root]))
    return candidates


def ensure_up(
    settings: dict[str, Any] | None = None,
    *,
    timeout_sec: float | None = None,
    launch: bool = True,
) -> dict[str, Any]:
    """
    Probe GET /v1/health; on refusal, optionally launch Electron and re-probe.
    Prefer `npm run dam:ensure` when available. Never opens dam.db.
    """
    settings = settings or {}
    base = resolve_base_url(settings)
    root = resolve_dammwt_root(settings)

    if (os.environ.get("DAM_API_DISABLE") or "").strip() in {"1", "true", "yes", "on"}:
        return {
            "ok": False,
            "code": "DAM_API_DISABLE",
            "error": "DAM_API_DISABLE is set — Electron will not start the localhost API.",
            "base": base,
            "dammwtRoot": root,
            "hint": "Unset DAM_API_DISABLE and launch: npm run review:electron",
        }

    if timeout_sec is None:
        try:
            timeout_sec = float(settings.get("ensure_timeout_sec") or 45)
        except (TypeError, ValueError):
            timeout_sec = 45.0

    try:
        health = probe_health(settings)
        return {
            "ok": True,
            "alreadyUp": True,
            "base": base,
            "dammwtRoot": root,
            "health": health,
        }
    except DamHttpError as exc:
        if exc.code not in {"DAM_UNREACHABLE", "DAM_TIMEOUT"}:
            return {
                "ok": False,
                "code": exc.code,
                "error": str(exc),
                "base": base,
                "dammwtRoot": root,
                "status": exc.status,
            }
        if not launch:
            return {
                "ok": False,
                "code": exc.code,
                "error": str(exc),
                "base": base,
                "dammwtRoot": root,
                "hint": "Start Electron: npm run review:electron or scripts/launch-dam.command",
            }

    if not root:
        return {
            "ok": False,
            "code": "DAM_NO_ROOT",
            "error": "DAMMWT_ROOT unset/unresolved; cannot auto-launch Electron.",
            "base": base,
            "hint": "Set DAMMWT_ROOT to the DAMMWT checkout, then: npm run review:electron",
        }

    via_cli = _ensure_via_cli(root, timeout_sec=float(timeout_sec), launch=True)
    if via_cli is not None:
        via_cli.setdefault("base", base)
        return via_cli

    launched: list[dict[str, Any]] = []
    last_err: str | None = None
    for label, argv in _launch_candidates(root):
        try:
            pid = _spawn_detached(argv, cwd=root)
            launched.append({"via": label, "argv": argv, "pid": pid})
            break
        except OSError as spawn_exc:
            last_err = f"{label}: {spawn_exc}"
            launched.append({"via": label, "argv": argv, "error": str(spawn_exc)})

    if not any(item.get("pid") for item in launched):
        return {
            "ok": False,
            "code": "DAM_LAUNCH_FAILED",
            "error": last_err or "Could not spawn Electron launch script",
            "base": base,
            "dammwtRoot": root,
            "launched": launched,
            "hint": "Manually run: cd $DAMMWT_ROOT && npm run review:electron",
        }

    deadline = time.monotonic() + float(timeout_sec)
    last_probe_error: str | None = None
    while time.monotonic() < deadline:
        time.sleep(1.0)
        try:
            health = probe_health(settings)
            return {
                "ok": True,
                "alreadyUp": False,
                "base": base,
                "dammwtRoot": root,
                "launched": launched,
                "health": health,
                "waitedSec": round(float(timeout_sec) - (deadline - time.monotonic()), 1),
            }
        except DamHttpError as exc:
            last_probe_error = str(exc)

    return {
        "ok": False,
        "code": "DAM_ENSURE_TIMEOUT",
        "error": (
            f"DAM API still unreachable at {base} after {timeout_sec}s. "
            f"Last probe: {last_probe_error}"
        ),
        "base": base,
        "dammwtRoot": root,
        "launched": launched,
        "hint": (
            "On headless/CI machines auto-launch may fail without a display. "
            "Start Gallery manually: npm run review:electron or scripts/launch-dam.command"
        ),
    }
