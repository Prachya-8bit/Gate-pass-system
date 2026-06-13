import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_NAME, verifyToken } from '@/lib/auth';
import ContractorFlow from '@/components/ContractorFlow';

export default async function ContractorPage() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  return <ContractorFlow credential={session.credential} role={session.role} />;
}
