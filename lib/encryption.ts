import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set")
  }
  // Key should be 64 hex chars = 32 bytes
  if (key.length === 64) {
    return Buffer.from(key, "hex")
  }
  // Fallback: hash whatever was provided to get 32 bytes
  return crypto.createHash("sha256").update(key).digest()
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string containing IV + ciphertext + auth tag.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8")
  encrypted = Buffer.concat([encrypted, cipher.final()])
  const tag = cipher.getAuthTag()

  // Concatenate: IV (16) + encrypted + tag (16)
  const result = Buffer.concat([iv, encrypted, tag])
  return result.toString("base64")
}

/**
 * Decrypt a base64 string that was encrypted with encrypt().
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey()
  const data = Buffer.from(encryptedBase64, "base64")

  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(data.length - TAG_LENGTH)
  const ciphertext = data.subarray(IV_LENGTH, data.length - TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString("utf8")
}
