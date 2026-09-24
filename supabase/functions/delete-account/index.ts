// Edge Function : suppression définitive du compte de l'utilisateur qui
// appelle cette fonction (jamais un autre compte — l'id est lu depuis son
// propre JWT, jamais depuis le body de la requête).
//
// Nécessaire car supprimer un utilisateur (auth.admin.deleteUser) exige la
// clé service_role, qui ne doit JAMAIS être embarquée dans l'app cliente.
// Cette fonction tourne côté serveur Supabase avec cette clé en variable
// d'environnement (SUPABASE_SERVICE_ROLE_KEY, posée automatiquement par
// Supabase pour toute Edge Function — pas besoin de la configurer à la main).
//
// La suppression de la ligne dans auth.users cascade ensuite vers toutes les
// tables applicatives qui référencent auth.users(id) avec `on delete cascade`
// (profiles, push_tokens, clips, live_session, team_listings, ...).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'MVP Tracker <noreply@mvptracker.fr>';

// Envoyée avant la suppression réelle (voir plus bas) — une fois le compte
// supprimé, son email n'est plus interrogeable. Best-effort : un échec
// d'envoi ne doit jamais empêcher la suppression elle-même, juste être
// avalé silencieusement (l'utilisateur veut partir, pas rester coincé à
// cause d'un souci d'email).
async function sendDeletionEmail(email: string) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: 'Ton compte MVP Tracker a été supprimé',
        text: "Compte supprimé.\n\nTon compte MVP Tracker et toutes tes données (profil, clips, tournois, messages...) viennent d'être supprimés définitivement, comme demandé.\n\nSi ce n'était pas toi, contacte-nous immédiatement.\n\n— L'équipe MVP Tracker",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
            <h1 style="color: #ff4655;">Compte supprimé</h1>
            <p>Ton compte MVP Tracker et toutes tes données (profil, clips, tournois, messages...) viennent d'être supprimés définitivement, comme demandé.</p>
            <p>Si ce n'était pas toi, contacte-nous immédiatement.</p>
            <p style="color: #888; font-size: 0.85em;">— L'équipe MVP Tracker</p>
          </div>
        `,
      }),
    });
  } catch {
    // Volontairement ignoré — voir commentaire ci-dessus.
  }
}

// L'app (Electron/Expo) appelle cette fonction depuis son propre "origin" —
// sans ces en-têtes, le navigateur bloque la requête au niveau du preflight
// CORS avant même qu'elle n'atteigne le code ci-dessous ("Failed to send a
// request to the Edge Function" côté client, sans autre détail).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Requête préliminaire envoyée automatiquement par le navigateur/fetch
  // avant la vraie requête POST — doit répondre 200 sans body.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Client "identité" : sert uniquement à vérifier le JWT du demandeur et à
  // retrouver son id — jamais utilisé pour l'opération de suppression elle-même.
  const identityClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await identityClient.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401, headers: corsHeaders });
  }

  // Envoyée AVANT la suppression : l'email de l'utilisateur ne sera plus
  // récupérable juste après.
  if (user.email) await sendDeletionEmail(user.email);

  // Client admin : seule cette étape a besoin des privilèges service_role.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
