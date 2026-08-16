import { createVideo } from '../lib/heygen';

async function repostVideoWithMotion() {
  const script = `Si inviertes en hostelería, hay una métrica que lo dice casi todo: el RevPAR, el ingreso por habitación disponible.

No basta con mirar el precio por noche. Lo que importa es cuánto genera realmente cada apartamento, esté ocupado o no.

Un activo con alta ocupación y tarifas sólidas siempre bate a uno con precios altos pero poca demanda.

Antes de invertir, pregúntate:
✅ ¿Cuál es el RevPAR histórico de la zona?
✅ ¿Quién gestiona el activo y cómo optimiza precio y ocupación?
✅ ¿El proyecto tiene demanda probada, no solo proyectada?

El RevPAR no miente. Es la diferencia entre una inversión que suena bien y una que realmente rinde.`;

  const caption = `Buenas prácticas de inversión hotelera: por qué el RevPAR importa más que el precio por noche 📊

Descubre más sobre nuestro próximo proyecto en Sevilla 👉 https://marketing-grupo-yakgu.vercel.app/go/es?utm_source=instagram&utm_medium=social&utm_campaign=bds36`;

  const avatarId = '3258c953a0344467bdbf131c1badbc36';

  // Motion prompt for natural hand gestures while speaking
  const motionPrompt = 'Natural, relaxed, and animated — move hands, arms, and upper body fluidly and naturally while speaking, as if explaining something to a colleague in person, with all visible body parts in motion rather than staying static.';

  console.log('Starting video generation with motion prompt...');
  console.log(`Motion: "${motionPrompt}"`);

  // Generate video with motion prompt
  const result = await createVideo(script, avatarId, undefined, motionPrompt);

  if (result.error || !result.videoId) {
    console.error('Failed to generate video:', result.error);
    process.exit(1);
  }

  console.log(`Video generated! Video ID: ${result.videoId}`);
  console.log('Note: Video generation takes a few minutes. The repost workflow has been initiated.');
  console.log('You will receive a Telegram notification when the video is ready and posted to Instagram.');
}

repostVideoWithMotion().catch(console.error);
