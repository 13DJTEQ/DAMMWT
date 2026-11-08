"""Tool handlers — HTTP/CLI adapters. Always return JSON strings; never raise."""

from __future__ import annotations

import json
import os
import shlex
import subprocess
from typing import Any
from urllib.parse import quote

from . import ensure as ensure_mod
from .http_client import (
    DamHttpError,
    dam_request,
    error_json,
    ok_json,
    resolve_base_url,
    resolve_dammwt_root,
    resolve_token,
    token_file_path,
)

# Filled by register(ctx) so handlers can read plugin settings without network at import.
_SETTINGS: dict[str, Any] = {}
_GET_CONFIG = None


def bind_runtime(*, get_config=None, settings: dict[str, Any] | None = None) -> None:
    """Called from register() only — no sockets."""
    global _GET_CONFIG, _SETTINGS
    _GET_CONFIG = get_config
    if settings:
        _SETTINGS.update(settings)


def _settings() -> dict[str, Any]:
    out = dict(_SETTINGS)
    getter = _GET_CONFIG
    if getter is None:
        return out
    for key, default in (
        ("api_base", ""),
        ("dammwt_root", ""),
        ("ensure_timeout_sec", 45),
    ):
        try:
            val = getter(key, default=default)
        except Exception:
            continue
        if val is not None and val != "":
            out[key] = val
    return out


def dam_health(args: dict, **kwargs) -> str:
    try:
        settings = _settings()
        data = dam_request("GET", "/v1/health", auth=False, settings=settings, timeout=5.0)
        if not isinstance(data, dict):
            data = {"health": data}
        data = {
            **data,
            "base": resolve_base_url(settings),
            "tokenConfigured": bool(resolve_token()),
            "tokenFile": str(token_file_path()),
            "dammwtRoot": resolve_dammwt_root(settings),
        }
        return ok_json(data)
    except Exception as exc:
        return error_json(exc, base=resolve_base_url(_settings()))


def dam_ensure_up(args: dict, **kwargs) -> str:
    try:
        settings = _settings()
        timeout = args.get("timeoutSec")
        launch = args.get("launch", True)
        result = ensure_mod.ensure_up(
            settings,
            timeout_sec=float(timeout) if timeout is not None else None,
            launch=bool(launch),
        )
        return json.dumps(result)
    except Exception as exc:
        return error_json(exc)


def dam_create_project(args: dict, **kwargs) -> str:
    try:
        slug = (args.get("slug") or "").strip()
        if not slug:
            return json.dumps({"ok": False, "error": "slug is required"})
        data = dam_request(
            "POST",
            "/v1/projects",
            body={"slug": slug},
            settings=_settings(),
        )
        return ok_json(data)
    except Exception as exc:
        return error_json(exc)


def _push_via_cli(args: dict, settings: dict[str, Any]) -> dict[str, Any]:
    root = resolve_dammwt_root(settings)
    if not root:
        raise DamHttpError(
            "DAMMWT_ROOT unset/unresolved; cannot run push:media CLI",
            code="DAM_NO_ROOT",
        )
    source = (args.get("sourcePath") or "").strip()
    partition = (args.get("partition") or "").strip()
    if not source or not partition:
        raise DamHttpError(
            "viaCli push requires sourcePath and partition",
            code="DAM_BAD_ARGS",
        )
    cmd = [
        "npm",
        "run",
        "push:media",
        "--prefix",
        root,
        "--",
        "--file",
        source,
        "--partition",
        partition,
    ]
    if args.get("project"):
        cmd.extend(["--project", str(args["project"])])
    if args.get("pipeline"):
        cmd.extend(["--pipeline", str(args["pipeline"])])
    if args.get("parentSourceId"):
        cmd.extend(["--parent", str(args["parentSourceId"])])
    if args.get("batch"):
        cmd.extend(["--batch", str(args["batch"])])
    if args.get("title"):
        cmd.extend(["--title", str(args["title"])])
    if args.get("cloudUrl"):
        cmd.extend(["--cloud-url", str(args["cloudUrl"])])
    if args.get("assetId"):
        cmd.extend(["--asset-id", str(args["assetId"])])
    tags = args.get("tags")
    if isinstance(tags, list) and tags:
        cmd.extend(["--tags", ",".join(str(t) for t in tags)])

    env = os.environ.copy()
    env["DAMMWT_ROOT"] = root
    proc = subprocess.run(
        cmd,
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    return {
        "ok": proc.returncode == 0,
        "viaCli": True,
        "command": " ".join(shlex.quote(c) for c in cmd),
        "exitCode": proc.returncode,
        "stdout": (proc.stdout or "")[-4000:],
        "stderr": (proc.stderr or "")[-2000:],
        "error": None
        if proc.returncode == 0
        else (proc.stderr or proc.stdout or f"push:media exited {proc.returncode}")[:500],
    }


def dam_push_asset(args: dict, **kwargs) -> str:
    try:
        settings = _settings()
        if args.get("viaCli"):
            return json.dumps(_push_via_cli(args, settings))

        body: dict[str, Any] = {}
        for key in (
            "sourcePath",
            "partition",
            "project",
            "pipeline",
            "parentSourceId",
            "batch",
            "tags",
            "title",
            "cloudUrl",
            "assetId",
            "ingest",
        ):
            if key in args and args[key] is not None:
                body[key] = args[key]
        if not body:
            return json.dumps(
                {
                    "ok": False,
                    "error": "Need sourcePath+partition (or ingest). Set viaCli=true for push:media.",
                }
            )
        data = dam_request("POST", "/v1/assets", body=body, settings=settings)
        return ok_json(data)
    except Exception as exc:
        return error_json(exc)


def dam_list_queue(args: dict, **kwargs) -> str:
    try:
        query = {
            "status": args.get("status"),
            "project": args.get("project"),
        }
        data = dam_request("GET", "/v1/queue", query=query, settings=_settings())
        return ok_json(data)
    except Exception as exc:
        return error_json(exc)


def dam_submit_decision(args: dict, **kwargs) -> str:
    try:
        asset_id = (args.get("assetId") or "").strip()
        decision = (args.get("decision") or "").strip()
        reviewed_by = (args.get("reviewedBy") or "").strip()
        if not asset_id or not decision or not reviewed_by:
            return json.dumps(
                {"ok": False, "error": "assetId, decision, and reviewedBy are required"}
            )
        body: dict[str, Any] = {
            "assetId": asset_id,
            "decision": decision,
            "reviewedBy": reviewed_by,
        }
        if "notes" in args:
            body["notes"] = args.get("notes")
        data = dam_request("POST", "/v1/approvals", body=body, settings=_settings())
        return ok_json(data)
    except Exception as exc:
        return error_json(exc)


def dam_update_notes(args: dict, **kwargs) -> str:
    try:
        asset_id = (args.get("assetId") or "").strip()
        if not asset_id:
            return json.dumps({"ok": False, "error": "assetId is required"})
        if "notes" not in args:
            return json.dumps({"ok": False, "error": "notes is required"})
        body: dict[str, Any] = {"notes": args.get("notes")}
        if args.get("reviewedBy"):
            body["reviewedBy"] = args["reviewedBy"]
        path = f"/v1/assets/{quote(asset_id, safe='')}/notes"
        data = dam_request("PATCH", path, body=body, settings=_settings())
        return ok_json(data)
    except Exception as exc:
        return error_json(exc)


def dam_get_lineage(args: dict, **kwargs) -> str:
    try:
        asset_id = (args.get("assetId") or "").strip()
        if not asset_id:
            return json.dumps({"ok": False, "error": "assetId is required"})
        path = f"/v1/assets/{quote(asset_id, safe='')}/lineage"
        data = dam_request("GET", path, settings=_settings())
        return ok_json(data)
    except Exception as exc:
        return error_json(exc)


def dam_refresh(args: dict, **kwargs) -> str:
    try:
        data = dam_request(
            "POST",
            "/v1/media/refresh",
            body={},
            settings=_settings(),
        )
        return ok_json(data)
    except Exception as exc:
        return error_json(exc)


def dam_export_feedback(args: dict, **kwargs) -> str:
    try:
        slug = (args.get("project") or args.get("slug") or "").strip()
        if not slug:
            return json.dumps({"ok": False, "error": "project (or slug) is required"})
        path = f"/v1/projects/{quote(slug, safe='')}/feedback"
        data = dam_request("GET", path, settings=_settings())
        return ok_json(data)
    except Exception as exc:
        return error_json(exc)
