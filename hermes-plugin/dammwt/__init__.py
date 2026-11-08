"""dammwt — native Hermes plugin for MWT DAM (localhost OpenAPI adapter).

register(ctx) must not open sockets — Plugin Doctor blocks network at registration.
All HTTP / ensure-up / CLI work happens inside tool handlers only.
"""

from __future__ import annotations

import logging
from pathlib import Path

from . import schemas, tools

logger = logging.getLogger(__name__)

TOOLSET = "dammwt"

_TOOL_BINDINGS = (
    ("dam_health", schemas.DAM_HEALTH, tools.dam_health),
    ("dam_ensure_up", schemas.DAM_ENSURE_UP, tools.dam_ensure_up),
    ("dam_create_project", schemas.DAM_CREATE_PROJECT, tools.dam_create_project),
    ("dam_push_asset", schemas.DAM_PUSH_ASSET, tools.dam_push_asset),
    ("dam_list_queue", schemas.DAM_LIST_QUEUE, tools.dam_list_queue),
    ("dam_submit_decision", schemas.DAM_SUBMIT_DECISION, tools.dam_submit_decision),
    ("dam_update_notes", schemas.DAM_UPDATE_NOTES, tools.dam_update_notes),
    ("dam_get_lineage", schemas.DAM_GET_LINEAGE, tools.dam_get_lineage),
    ("dam_refresh", schemas.DAM_REFRESH, tools.dam_refresh),
    ("dam_export_feedback", schemas.DAM_EXPORT_FEEDBACK, tools.dam_export_feedback),
)


def register(ctx):
    """Wire schemas → handlers and bundle skills. No network here."""
    # Bind settings accessor for handlers (still no I/O).
    tools.bind_runtime(get_config=getattr(ctx, "get_config", None))

    for name, schema, handler in _TOOL_BINDINGS:
        ctx.register_tool(
            name=name,
            toolset=TOOLSET,
            schema=schema,
            handler=handler,
        )

    skills_dir = Path(__file__).parent / "skills"
    if skills_dir.is_dir():
        for child in sorted(skills_dir.iterdir()):
            skill_md = child / "SKILL.md"
            if child.is_dir() and skill_md.is_file():
                ctx.register_skill(child.name, skill_md)
                logger.debug("Registered bundled skill dammwt:%s", child.name)

    logger.info(
        "dammwt plugin registered (%d tools); skills via skill_view('dammwt:<name>')",
        len(_TOOL_BINDINGS),
    )
