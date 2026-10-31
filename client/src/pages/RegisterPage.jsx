import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { InlineError } from '../components/States';
import { Field, Input, Select } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { getApiError, getFieldErrors } from '../utils/errors';
import { AuthShell } from './AuthShell';

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80, 'Name is too long.'),
    email: z.string().trim().email('Enter a valid email address.'),
    role: z.enum(['student', 'teacher']),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(72, 'Password must be at most 72 characters.')
      .regex(/[A-Za-z]/, 'Password needs at least one letter.')
      .regex(/\d/, 'Password needs at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const RegisterPage = () => {
  const navigate = useNavigate();
  const registerUser = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    defaultValues: { role: 'student' },
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  });

  const onSubmit = async ({ confirmPassword, ...values }) => {
    setServerError('');
    try {
      await registerUser(values);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const apiError = getApiError(error);
      const fieldErrors = getFieldErrors(error);
      if (apiError.code === 'DUPLICATE_EMAIL') {
        setError('email', { type: 'server', message: 'An account with this email already exists.' });
        return;
      }
      Object.entries(fieldErrors).forEach(([field, message]) => {
        if (['name', 'email', 'password', 'role'].includes(field)) {
          setError(field, { type: 'server', message });
        }
      });
      if (Object.keys(fieldErrors).length === 0) setServerError(apiError.message);
    }
  };

  return (
    <AuthShell
      description="Create a student or teacher account. Admin accounts are provisioned by the platform."
      footer={
        <p>
          Already have an account?{' '}
          <Link className="link" to="/login">
            Sign in
          </Link>
        </p>
      }
      kicker="Get started"
      title="Create your account."
    >
      <form className="space-y-4" noValidate onSubmit={handleSubmit(onSubmit)}>
        <Field error={errors.name?.message} htmlFor="name" label="Full name">
          <Input autoComplete="name" id="name" placeholder="Asha Kumar" {...register('name')} />
        </Field>

        <Field error={errors.email?.message} htmlFor="email" label="Email address">
          <Input autoComplete="email" id="email" placeholder="you@example.com" type="email" {...register('email')} />
        </Field>

        <Field error={errors.role?.message} htmlFor="role" label="I am a">
          <Select id="role" {...register('role')}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={errors.password?.message} htmlFor="password" label="Password">
            <Input
              autoComplete="new-password"
              id="password"
              placeholder="8+ characters"
              type="password"
              {...register('password')}
            />
          </Field>
          <Field error={errors.confirmPassword?.message} htmlFor="confirmPassword" label="Confirm password">
            <Input
              autoComplete="new-password"
              id="confirmPassword"
              placeholder="Repeat password"
              type="password"
              {...register('confirmPassword')}
            />
          </Field>
        </div>
        <p className="-mt-1 text-xs text-slate-500 dark:text-slate-400">
          Use at least 8 characters with one letter and one number.
        </p>

        {serverError && <InlineError>{serverError}</InlineError>}

        <button className="btn-primary w-full" disabled={isLoading} type="submit">
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
};

export default RegisterPage;
