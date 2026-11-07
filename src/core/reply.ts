/**
 * What the server wants to tell the harness. Only what a policy produces today: text to put in front of the model.
 * Deny, stop and rewrite are added when a policy needs them, together with their encoding in every adapter.
 */
export interface NeutralReply {
  context?: string;
}
