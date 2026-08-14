import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_NAME, verifyToken } from '@/lib/auth';
import VehicleFlow from '@/components/VehicleFlow';

export default async function ContractorVehiclePage() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  return <VehicleFlow credential={session.credential} role={session.role} />;
}
