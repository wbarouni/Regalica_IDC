import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { User, CreateUserInput } from '@/types'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { generateId, validateEmail } from '@/lib/utils'

export async function createUser(input: CreateUserInput): Promise<User> {
  if (!validateEmail(input.email)) {
    throw new Error('Email invalide')
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  })

  if (existingUser) {
    throw new Error('Cet email est déjà utilisé')
  }

  const hashedPassword = await hashPassword(input.password)
  const id = generateId()

  const newUser = await db.insert(users).values({
    id,
    email: input.email,
    password: hashedPassword,
    firstName: input.firstName,
    lastName: input.lastName,
    organization: input.organization,
    role: input.role || 'viewer',
    isActive: true,
  })

  return {
    id,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    organization: input.organization,
    role: input.role || 'viewer',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export async function getUserById(id: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
  })

  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    organization: user.organization || undefined,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    organization: user.organization || undefined,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (!user || !user.isActive) return null

  const isPasswordValid = await verifyPassword(password, user.password)
  if (!isPasswordValid) return null

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    organization: user.organization || undefined,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
  await db.update(users).set(updates).where(eq(users.id, id))
  return getUserById(id)
}

export async function deleteUser(id: string): Promise<boolean> {
  const result = await db.delete(users).where(eq(users.id, id))
  return true
}

export async function listUsers(limit: number = 10, offset: number = 0): Promise<User[]> {
  const usersList = await db.query.users.findMany({
    limit,
    offset,
  })

  return usersList.map((user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    organization: user.organization || undefined,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }))
}
