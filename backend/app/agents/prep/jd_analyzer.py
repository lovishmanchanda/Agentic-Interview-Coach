"""3.3 JD analyzer: a pasted job description -> structured requirements in the shared vocabulary."""
from app.agents.prep.schemas import JDAnalysisOutput
from app.agents.prep.vocabulary import ALL_TOPICS, KIND_OF
from app.core.prompts import render_for
from app.gateway import AIGateway
from app.gateway.types import CallContext

JD_PROMPT = "prep/jd_analysis_v1"


async def analyze_jd(jd_text: str, *, gateway: AIGateway, context: CallContext) -> dict:
    # Extraction into a fixed schema: the fast tier is enough, and it runs alongside company research.
    out = await gateway.generate_structured(render_for(context, JD_PROMPT, jd_text=jd_text, all_topics=", ".join(ALL_TOPICS)),
                                            JDAnalysisOutput, context=context, tier="fast")
    # Areas outside the vocabulary become "other skills" rather than silently disappearing.
    unmapped = [r["area"] for r in out["requirements"] if r["area"] not in KIND_OF]
    out["requirements"] = [r for r in out["requirements"] if r["area"] in KIND_OF]
    out["other_skills"] = list(dict.fromkeys([*out["other_skills"], *unmapped]))[:12]
    return out
