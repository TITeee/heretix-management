/**
 * The audit log's action names as people read them. Client-safe.
 *
 * An action not listed here (a newer one, or one written by a later version) shows as its
 * name in words, so the log never hides a kind of event for want of a label.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: "Login",
  login_failed: "Login Failed",
  user_created: "User Created",
  user_updated: "User Updated",
  user_deleted: "User Deleted",
  user_password_reset: "Password Reset",
  settings_updated: "Settings Updated",
  asset_created: "Asset Created",
  asset_updated: "Asset Updated",
  asset_deleted: "Asset Deleted",
  asset_imported: "Asset Imported",
  asset_bulk_import: "Assets Imported (CSV)",
  asset_scanned: "Asset Scanned",
  assets_rescanned: "Assets Rescanned",
  alerts_status_changed: "Alerts Status Changed",
  alerts_accepted: "Alerts Accepted",
  alerts_exported: "Alerts Exported",
  api_token_created: "Token Created",
  api_token_revoked: "Token Revoked",
  api_token_deleted: "Token Deleted",
  ai_chat_cleared: "AI Chat Cleared",
  history_purged: "History Purged",
  audit_exported: "Audit Log Exported",
}

export function auditActionLabel(action: string): string {
  return (
    AUDIT_ACTION_LABELS[action] ??
    action.split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")
  )
}
