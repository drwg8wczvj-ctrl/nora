export function shouldPreviewPlannerOperations(userText = "", operations = []) {
  if (operations.length > 1) return true;
  return /\b(plan|schedule|organize|organise|rebalance)\b[\s\S]{0,80}\b(week|days?|everything|all|full|complete)\b/i.test(userText);
}

export function proposalStorageKey(proposalId) {
  return `nora_schedule_proposal_${proposalId}`;
}
