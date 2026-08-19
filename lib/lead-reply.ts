// First-draft copy -- review and tweak the wording before this goes out to
// real leads. Kept deliberately short and generic about what Grupo Yakgu
// does, since this file doesn't know the specifics of any given property or
// campaign.

export interface WelcomeEmailInput {
  name: string;
  mensaje?: string | null;
}

export function buildWelcomeEmail({ name, mensaje }: WelcomeEmailInput): { subject: string; text: string } {
  const firstName = name.trim().split(/\s+/)[0] || name;
  const subject = 'Gracias por contactar con Grupo Yakgu';
  const mensajeLine = mensaje?.trim() ? `Hemos recibido tu mensaje: "${mensaje.trim()}"\n\n` : '';

  const text = `Hola ${firstName},

¡Gracias por ponerte en contacto con Grupo Yakgu! Somos un equipo dedicado a proyectos inmobiliarios, y nos encanta poder acompañar a personas como tú desde el primer momento.

${mensajeLine}Nos encantaría contarte más y resolver cualquier duda que tengas. ¿Te vendría bien una breve llamada esta semana para comentarlo con calma? Dinos qué día y hora te viene mejor y lo coordinamos encantados.

¡Un saludo!
Equipo Grupo Yakgu`;

  return { subject, text };
}
