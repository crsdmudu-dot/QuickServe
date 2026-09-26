// admin-account-suspension — suspend or lift a customer or provider, from the admin web (F5.6b).
//
// This file is the Deno EDGE: environment, Supabase client construction, and the Request/Response boundary. Every
// decision the function makes lives in `./handler.ts`, which imports nothing and touches no global, so the real
// control flow can be exercised in Jest against recording fakes. Keep it that way: logic added here is logic no test
// can reach. See handler.ts for the security model.
//
// ENVIRONMENT
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  provided by the platform
//   ADMIN_ORIGIN  the admin web's exact origin (https://…, no path). Set as a secret only within the suspension
//                 rollout's authorisation. Unset or malformed means every browser request is refused.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { handleSuspension, parseAdminOrigin } from './handler.ts';
import type { BanState, Deps } from './handler.ts';

const AUTH_OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

Deno.serve(async (req: Request) => {
  const adminOrigin = parseAdminOrigin(Deno.env.get('ADMIN_ORIGIN'));
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const service = createClient(supabaseUrl, serviceKey, AUTH_OPTS);

    const deps: Deps = {
      adminOrigin,
      // The caller's own token: suspend and lift run as the admin, so the database checks them again.
      caller: (authHeader: string) => {
        const client = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
          ...AUTH_OPTS,
        });
        return {
          getUser: () => client.auth.getUser(),
          suspend: (args) => client.rpc('admin_suspend_account', args),
          lift: (args) => client.rpc('admin_lift_account_suspension', args),
        };
      },
      // The service role: reads, the Auth ban, and recording its outcome. Nothing else.
      service: {
        readProfile: (uid: string) =>
          service.from('profiles').select('role, approval_status, deleted_at').eq('id', uid).maybeSingle(),
        readLatestSuspension: (uid: string) =>
          service
            .from('account_suspensions')
            .select('id, lifted_at')
            .eq('user_id', uid)
            .order('suspended_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        setBan: (uid: string, banDuration: string) => service.auth.admin.updateUserById(uid, { ban_duration: banDuration }),
        recordBanState: (suspensionId: string, state: BanState) =>
          service.rpc('set_suspension_ban_state', { p_suspension: suspensionId, p_state: state }),
      },
    };

    const { status, headers, body } = await handleSuspension(
      {
        method: req.method,
        origin: req.headers.get('Origin'),
        authHeader: req.headers.get('Authorization'),
        json: () => req.json(),
      },
      deps,
    );
    return new Response(body === null ? null : JSON.stringify(body), { status, headers });
  } catch {
    // Deliberately no detail: nothing about the request may reach the logs.
    return new Response(JSON.stringify({ ok: false, error: 'Unexpected error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', Vary: 'Origin' },
    });
  }
});
