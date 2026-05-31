import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    })

    if (!user) return apiError('MBR_001', 'User not found', 404)

    return apiSuccess({
      ...user,
      roles: user.roles.map((r) => r.role.name),
    })
  } catch (err) {
    return handleServiceError(err)
  }
}
