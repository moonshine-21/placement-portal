import { supabase } from './supabase';

export async function logAdminAction(params: {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, unknown>;
}) {
  const { error } = await supabase.from('admin_audit_log').insert({
    actor_id: params.actorId,
    actor_name: params.actorName,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId || '',
    target_label: params.targetLabel || '',
    details: params.details || {},
  });
  if (error) console.error('Failed to write audit log:', error);
}
