import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="admin-body admin-login"><p>Завантаження...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}