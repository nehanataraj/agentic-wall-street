import { END, START, StateGraph } from "@langchain/langgraph";
import {
  classifyNode,
  draftNode,
  hardRulesNode,
  loadKbNode,
  policyCheckNode,
  requireLlmKeyNode,
} from "./nodes.js";
import { EmailAgentState, type EmailAgentStateType } from "./state.js";

/**
 * Structured contact email agent (LangGraph).
 *
 * hard_rules → require_llm_key → load_kb → classify → draft? → policy_check → END
 * No free-form tool loops — each step is fixed.
 */
export function buildEmailAgentGraph() {
  const graph = new StateGraph(EmailAgentState)
    .addNode("hard_rules", hardRulesNode)
    .addNode("require_llm_key", requireLlmKeyNode)
    .addNode("load_kb", loadKbNode)
    .addNode("classify", classifyNode)
    .addNode("draft", draftNode)
    .addNode("policy_check", policyCheckNode)
    .addEdge(START, "hard_rules")
    .addEdge("hard_rules", "require_llm_key")
    .addEdge("require_llm_key", "load_kb")
    .addEdge("load_kb", "classify")
    .addConditionalEdges("classify", (state: EmailAgentStateType) => {
      return state.action === "auto_reply" ? "draft" : END;
    })
    .addEdge("draft", "policy_check")
    .addEdge("policy_check", END);

  return graph.compile();
}

export type EmailAgentGraph = ReturnType<typeof buildEmailAgentGraph>;
