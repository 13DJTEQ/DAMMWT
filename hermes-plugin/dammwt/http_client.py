"""Stdlib HTTP client for the DAM localhost OpenAPI (handlers only — never at register)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_PORT = 7842
DEFAULT_BASE = f"http://127.0.0.1:{DEFAULT_PORT}"
DEFAULT_TOKEN_FILE = (
    Path.home()
    / "Library"
    / "Application Support"
    / "@13djteq"
    / "mwt-dam-mvp"
    / "dam-api-token"
)


class DamHttpError(Exception):
    """Structured HTTP / connectivity failure for handlers."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "DAM_HTTP",
        status: int | None = None,
        data: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.data = data


def _get_secret(name: str) -> str | None:
    """Read a Hermes-managed secret; fall back to process env."""
    try:
        from agent.secret_scope import get_secret  # type: ignore

        value = get_secret(name)
        if value is not None and str(value).strip():
            return str(value).strip()
    except Exception:
        pass
    env = os.environ.get(name)
    if env and env.strip():
        return env.strip()
    return None


def resolve_base_url(settings: dict[str, Any] | None = None) -> str:
    settings = settings or {}
    cfg = (settings.get("api_base") or "").strip()
    if cfg:
        return cfg.rstrip("/")
    env = (os.environ.get("DAM_API_BASE") or "").strip()
    if env:
        return env.rstrip("/")
    port_raw = os.environ.get("DAM_API_PORT") or str(DEFAULT_PORT)
    try:
        port = int(port_raw)
    except ValueError:
        port = DEFAULT_PORT
    return f"http://127.0.0.1:{port}"


def resolve_dammwt_root(settings: dict[str, Any] | None = None) -> str | None:
    settings = settings or {}
    cfg = (settings.get("dammwt_root") or "").strip()
    if cfg and Path(cfg).is_dir():
        return str(Path(cfg).resolve())
    env = (os.environ.get("DAMMWT_ROOT") or "").strip()
    if env and Path(env).is_dir():
        return str(Path(env).resolve())
    # Plugin lives at <root>/hermes-plugin/dammwt/
    here = Path(__file__).resolve().parent
    candidate = here.parent.parent
    if (candidate / "package.json").is_file() and (candidate / "src").is_dir():
        return str(candidate)
    return None


def token_file_path() -> Path:
    env = (os.environ.get("DAM_API_TOKEN_FILE") or "").strip()
    if env:
        return Path(env).expanduser()
    return DEFAULT_TOKEN_FILE


def resolve_token() -> str | None:
    secret = _get_secret("DAM_API_TOKEN")
    if secret:
        return secret
    path = token_file_path()
    try:
        if path.is_file():
            text = path.read_text(encoding="utf-8").strip()
            if text:
                return text
    except OSError:
        pass
    return None


def dam_request(
    method: str,
    path: str,
    *,
    body: Any = None,
    query: dict[str, Any] | None = None,
    auth: bool = True,
    settings: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> Any:
    """Perform one HTTP call. Raises DamHttpError; never used during register()."""
    base = resolve_base_url(settings)
    if path.startswith("http://") or path.startswith("https://"):
        url = path
    else:
        url = f"{base}{path if path.startswith('/') else '/' + path}"

    if query:
        pairs = [
            (k, str(v))
            for k, v in query.items()
            if v is not None and str(v) != ""
        ]
        if pairs:
            url = f"{url}?{urllib.parse.urlencode(pairs)}"

    headers = {"Accept": "application/json"}
    data_bytes: bytes | None = None
    if body is not None:
        data_bytes = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    if auth:
        token = resolve_token()
        if not token:
            raise DamHttpError(
                f"DAM API token missing. Set DAM_API_TOKEN (Hermes secret) "
                f"or create {token_file_path()} (start Electron once / npm run dam:token).",
                code="DAM_NO_TOKEN",
            )
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw:
                return {"ok": True}
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"ok": True, "raw": raw[:500]}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        data: Any = None
        if raw:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                data = {"error": raw[:500]}
        msg = None
        if isinstance(data, dict):
            msg = data.get("error") or data.get("message")
        raise DamHttpError(
            str(msg or f"HTTP {exc.code} {exc.reason}"),
            code="DAM_HTTP",
            status=exc.code,
            data=data,
        ) from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise DamHttpError(
            f"DAM API unreachable at {base} ({reason}). "
            "Call dam_ensure_up or start Electron: npm run review:electron / scripts/launch-dam.command",
            code="DAM_UNREACHABLE",
        ) from exc
    except TimeoutError as exc:
        raise DamHttpError(
            f"DAM API timed out at {base}",
            code="DAM_TIMEOUT",
        ) from exc


def error_json(exc: BaseException, **extra: Any) -> str:
    payload: dict[str, Any] = {"ok": False, "error": str(exc)}
    if isinstance(exc, DamHttpError):
        payload["code"] = exc.code
        if exc.status is not None:
            payload["status"] = exc.status
        if exc.data is not None:
            payload["data"] = exc.data
    payload.update(extra)
    return json.dumps(payload)


def ok_json(data: Any) -> str:
    if isinstance(data, dict) and "ok" not in data:
        out = {"ok": True, **data}
        return json.dumps(out)
    if isinstance(data, dict):
        return json.dumps(data)
    return json.dumps({"ok": True, "result": data})
