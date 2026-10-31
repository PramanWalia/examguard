import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Field, Input } from '../components/ui';
import { InlineError } from '../components/States';
import { useAuthStore } from '../store/authStore';
import { getApiError, getFieldErrors } from '../utils/errors';
import { AuthShell } from './AuthShell';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema), mode: 'onBlur' });

  const onSubmit = async (values) => {
    setServerError('');
    try {
      await login(values);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (error) {
      const apiError = getApiError(error);
      const fieldErrors = getFieldErrors(error);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        if (field === 'email' || field === 'password') setError(field, { type: 'server', message });
      });
      if (apiError.code === 'UNAUTHORIZED') {
        setError('password', { type: 'server', message: 'Email or password is incorrect.' });
      } else if (Object.keys(fieldErrors).length === 0) {
        setServerError(apiError.message);
      }
    }
  };

  return (
    <AuthShell
      description="Pick up your exams, question bank, and results from one secure workspace."
      footer={
        <p>
          New to ExamGuard?{' '}
          <Link className="link" to="/register">
            Create an account
          </Link>
        </p>
      }
      kicker="Welcome back"
      title="Sign in to continue."
    >
      <form className="space-y-4" noValidate onSubmit={handleSubmit(onSubmit)}>
        <Field error={errors.email?.message} htmlFor="email" label="Email address">
          <Input
            autoComplete="email"
            id="email"
            placeholder="you@example.com"
            type="email"
            {...register('email')}
          />
        </Field>

        <Field error={errors.password?.message} htmlFor="password" label="Password">
          <div className="relative">
            <Input
              autoComplete="current-password"
              className="pr-16"
              id="password"
              placeholder="Your password"
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
            />
            <button
              className="absolute inset-y-0 right-2 my-auto h-8 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>

        {serverError && <InlineError>{serverError}</InlineError>}

        <button className="btn-primary w-full" disabled={isLoading} type="submit">
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

    </AuthShell>
  );
};

export default LoginPage;
