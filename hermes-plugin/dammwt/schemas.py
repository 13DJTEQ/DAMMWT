"""LLM-facing tool schemas for the dammwt Hermes plugin."""

from __future__ import annotations

DAM_HEALTH = {
    "name": "dam_health",
    "description": (
        "Check whether Electron MWT DAM localhost API is up (GET /v1/health, no auth). "
        "Fail fast if DAM is not running before mutating work."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
}

DAM_ENSURE_UP = {
    "name": "dam_ensure_up",
    "description": (
        "Ensure the DAM localhost API is reachable. Probes GET /v1/health; on connection "
        "refused, best-effort launches Electron (review:electron / launch-dam.command) from "
        "DAMMWT_ROOT and re-probes. Never opens dam.db. Call before autonomous loops."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "timeoutSec": {
                "type": "number",
                "description": "Seconds to wait after launch (default from plugin settings / 45)",
            },
            "launch": {
                "type": "boolean",
                "description": "If false, only probe — do not spawn Electron (default true)",
            },
        },
        "additionalProperties": False,
    },
}

DAM_CREATE_PROJECT = {
    "name": "dam_create_project",
    "description": (
        "Create/ensure a Gallery project section under assets/media/projects/<slug>/ "
        "(same as npm run dam:section). Idempotent."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "slug": {
                "type": "string",
                "description": "Lowercase kebab-case project slug",
            },
        },
        "required": ["slug"],
        "additionalProperties": False,
    },
}

DAM_PUSH_ASSET = {
    "name": "dam_push_asset",
    "description": (
        "Stage/ingest an asset into DAM. Default: POST /v1/assets when Electron is up. "
        "Set viaCli=true to shell out to `npm run push:media` (preferred for bulk bytes / "
        "when API push is unavailable). Requires absolute sourcePath + partition."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "sourcePath": {
                "type": "string",
                "description": "Absolute path to image on disk",
            },
            "partition": {
                "type": "string",
                "enum": ["originals", "tattoos", "generated"],
            },
            "project": {"type": "string"},
            "pipeline": {"type": "string"},
            "parentSourceId": {"type": ["string", "null"]},
            "batch": {"type": "string"},
            "tags": {"type": "array", "items": {"type": "string"}},
            "title": {"type": ["string", "null"]},
            "cloudUrl": {"type": ["string", "null"]},
            "assetId": {"type": ["string", "null"]},
            "viaCli": {
                "type": "boolean",
                "description": "If true, run npm run push:media instead of HTTP POST /v1/assets",
            },
            "ingest": {
                "type": "object",
                "description": "DB-only ingest when bytes already under media root",
                "additionalProperties": True,
            },
        },
        "additionalProperties": False,
    },
}

DAM_LIST_QUEUE = {
    "name": "dam_list_queue",
    "description": (
        "List Gallery review queue rows. Optional status + project filters. "
        "Use to see pending review and decided rows for feedback."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "enum": ["pending", "love", "keep", "reject", "changesRequested"],
            },
            "project": {
                "type": "string",
                "description": "Project section slug filter",
            },
        },
        "additionalProperties": False,
    },
}

DAM_SUBMIT_DECISION = {
    "name": "dam_submit_decision",
    "description": (
        "Submit a Gallery decision (love|keep|reject|changesRequested) via POST /v1/approvals. "
        "Prefer humans deciding in the UI; harness automation may call this. Notes remain "
        "editable afterward via dam_update_notes."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "assetId": {"type": "string"},
            "decision": {
                "type": "string",
                "enum": ["love", "keep", "reject", "changesRequested"],
            },
            "reviewedBy": {
                "type": "string",
                "description": "Who decided (e.g. hermes, dave, comfy-harness)",
            },
            "notes": {"type": "string"},
        },
        "required": ["assetId", "decision", "reviewedBy"],
        "additionalProperties": False,
    },
}

DAM_UPDATE_NOTES = {
    "name": "dam_update_notes",
    "description": (
        "Amend approval notes after love/keep/reject without changing status "
        "(PATCH /v1/assets/:assetId/notes). Steering continues after decide."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "assetId": {"type": "string"},
            "notes": {
                "type": "string",
                "description": "New notes text (empty string clears or stores empty per DamService)",
            },
            "reviewedBy": {
                "type": "string",
                "description": "Optional reviewer attribution for the notes amend",
            },
        },
        "required": ["assetId", "notes"],
        "additionalProperties": False,
    },
}

DAM_GET_LINEAGE = {
    "name": "dam_get_lineage",
    "description": (
        "Walk parentSourceId to SoT + siblings sharing the same parent. "
        "Steer next generation from loves + SoT."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "assetId": {"type": "string"},
        },
        "required": ["assetId"],
        "additionalProperties": False,
    },
}

DAM_REFRESH = {
    "name": "dam_refresh",
    "description": "Force reseed from assets/media/manifest.json into ReviewQueue (POST /v1/media/refresh).",
    "parameters": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
}

DAM_EXPORT_FEEDBACK = {
    "name": "dam_export_feedback",
    "description": (
        "Export structured project feedback JSON (status, notes, reviewedBy/At, lineage "
        "pointers) for the next generation loop — GET /v1/projects/:slug/feedback. "
        "Does not open SQLite directly."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "project": {
                "type": "string",
                "description": "Project section slug",
            },
            "slug": {
                "type": "string",
                "description": "Alias for project",
            },
        },
        "additionalProperties": False,
    },
}

ALL_SCHEMAS = (
    DAM_HEALTH,
    DAM_ENSURE_UP,
    DAM_CREATE_PROJECT,
    DAM_PUSH_ASSET,
    DAM_LIST_QUEUE,
    DAM_SUBMIT_DECISION,
    DAM_UPDATE_NOTES,
    DAM_GET_LINEAGE,
    DAM_REFRESH,
    DAM_EXPORT_FEEDBACK,
)
