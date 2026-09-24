// Edge Function : email de bienvenue, déclenchée par un Database Webhook
// Supabase sur INSERT dans auth.users (configuré dans le dashboard, voir
// Database > Webhooks) — pas par l'app cliente directement. À l'inscription,
// l'utilisateur n'a pas encore de session active tant qu'il n'a pas confirmé
// son email, donc impossible d'appeler cette fonction avec son propre JWT
// comme pour delete-account : le webhook s'exécute côté serveur, déclenché
// par l'insertion réelle en base, ce qui est à la fois plus fiable (ne peut
// pas être raté ou dupliqué par le client) et plus sûr (pas de endpoint
// public appelable avec n'importe quel email).
//
// Ne remplace pas l'email de confirmation natif de Supabase (obligatoire
// pour activer le compte) — s'ajoute simplement comme un message de
// bienvenue séparé.
//
// Sécurité : le Database Webhook envoie l'en-tête `x-webhook-secret` (à
// configurer côté dashboard avec la même valeur que le secret
// WEBHOOK_SECRET posé ici) — sans ça, n'importe qui pourrait spammer cette
// fonction pour envoyer des emails depuis ton compte Resend.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!;
const FROM_EMAIL = 'MVP Tracker <noreply@mvptracker.fr>';

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const payload = await req.json();
  const email = payload?.record?.email;
  if (!email) {
    return new Response(JSON.stringify({ error: 'Missing email in payload' }), { status: 400 });
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: 'Bienvenue sur MVP Tracker',
      // Confirmation d'email désactivée sur ce projet Supabase (compte actif
      // immédiatement) — pas de mention d'un email de confirmation à venir.
      text: "Bienvenue sur MVP Tracker.\n\nTon compte vient d'être créé. Lie ton compte Riot dans l'app pour commencer à suivre tes stats Valorant.\n\nÀ bientôt en jeu !\n\n— L'équipe MVP Tracker",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
          <h1 style="color: #ff4655;">Bienvenue sur MVP Tracker</h1>
          <p>Ton compte vient d'être créé. Lie ton compte Riot dans l'app pour commencer à suivre tes stats Valorant.</p>
          <p>À bientôt en jeu !</p>
          <p style="color: #888; font-size: 0.85em;">— L'équipe MVP Tracker</p>
        </div>
      `,
    }),
  });

  if (!resendResponse.ok) {
    const detail = await resendResponse.text();
    return new Response(JSON.stringify({ error: `Resend error: ${detail}` }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
