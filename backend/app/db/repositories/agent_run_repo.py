"""agent_runs: one document per agent run, for debugging and Phase 6 dashboards (architecture principle 8:
agents are observable)."""


class AgentRunRepository:
    def __init__(self, db):
        self.runs = db["agent_runs"]

    async def record(self, doc: dict) -> None:
        await self.runs.insert_one({**doc})

    async def for_session(self, session_id: str) -> list[dict]:
        return await self.runs.find({"session_id": session_id}, {"_id": 0}).sort("started_at", 1).to_list(length=200)
