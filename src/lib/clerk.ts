import { dark } from '@clerk/themes';

export const clerkAppearance = {
  baseTheme: dark, // Modo oscuro global para todos los formularios
};

export const clerkLocalization = {
  locale: 'es-ES',
  signIn: {
    start: {
      title: 'Iniciar sesión',
      subtitle: 'Por favor, inicie sesión para continuar',
    },
  },
  signUp: {
    start: {
      title: 'Registro',
      subtitle: 'Rellena tus datos para comenzar',
    },
  },
};
