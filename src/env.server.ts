// src/env.server.ts
import dotenv from 'dotenv';
dotenv.config();

// Exportar las vars ya tipadas/aseguradas si querés reusarlas
export const SMTP_HOST   = process.env.SMTP_HOST;
export const SMTP_PORT   = process.env.SMTP_PORT;
export const SMTP_SECURE = process.env.SMTP_SECURE;
export const SMTP_USER   = process.env.SMTP_USER;
export const SMTP_PASS   = process.env.SMTP_PASS;
