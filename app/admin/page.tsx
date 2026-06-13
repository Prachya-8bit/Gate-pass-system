import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_NAME, verifyToken } from '@/lib/auth';
import AdminFlow from '@/components/AdminFlow';

export default async function AdminPage() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  return <AdminFlow credential={session.credential} role={session.role} />;
}
