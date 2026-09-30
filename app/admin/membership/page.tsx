import { redirect } from 'next/navigation';

export default async function MembershipPage() {
  redirect('/admin/plans');
}
