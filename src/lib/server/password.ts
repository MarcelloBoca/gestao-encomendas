// Palavras-passe guardadas com scrypt (sal aleatório por conta). Nunca se guarda a palavra-passe em claro.

import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "crypto";
import { UserError } from "../domain";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** Formato: s1$N$r$p$sal$hash (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ["s1", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "s1") return false;
  const [, n, r, p, saltText, keyText] = parts;
  const expected = Buffer.from(keyText, "base64url");
  const key = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | null = null;

/** Para utilizadores que não existem: gasta o mesmo tempo, para não revelar quais existem. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummy ??= hashPassword("palavra-passe-que-nao-existe");
  await verifyPassword(password, await dummy);
}

/** Utilizador em minúsculas, 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username);
}

export function validateUsername(input: string): string {
  const username = normalizeUsername(input);
  if (!isValidUsername(username)) {
    throw new UserError("O utilizador tem de ter 3 a 32 caracteres: letras sem acentos, números, ponto, hífen ou sublinhado (ex.: fatima).");
  }
  return username;
}

export function validateNewPassword(password: string, confirm?: string): string {
  if (password.length < 8) throw new UserError("A palavra-passe tem de ter pelo menos 8 caracteres.");
  if (password.length > 128) throw new UserError("A palavra-passe é demasiado longa (máximo 128 caracteres).");
  if (confirm !== undefined && confirm !== password) throw new UserError("As duas palavras-passe não são iguais.");
  return password;
}

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 10;
