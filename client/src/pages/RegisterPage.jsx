import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { InlineError } from '../components/States';
import { EyeIcon, EyeOffIcon, Field, Input, Select } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { getApiError, getFieldErrors } from '../utils/errors';
import { AuthShell } from './AuthShell';

const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters.')
      .max(80, 'Name is too long.'),
    email: z.string().trim().email('Enter a valid email address.'),
    role: z.enum(['student', 'teacher']),
    inviteCode: z.string().trim().max(64, 'Invite code is too long.').optional(),
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingTeacherUser, setPendingTeacherUser] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: { role: 'student', inviteCode: '' },
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  });

  const selectedRole = watch('role');

  const onSubmit = async ({ confirmPassword, inviteCode, ...values }) => {
    setServerError('');
    try {
      const payload = {
        ...values,
        ...(values.role === 'teacher' && inviteCode?.trim()
          ? { inviteCode: inviteCode.trim() }
          : {}),
      };
      const result = await registerUser(payload);
      if (result?.pendingApproval) {
        setPendingTeacherUser(result.user || { email: values.email });
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const apiError = getApiError(error);
      const fieldErrors = getFieldErrors(error);
      if (apiError.code === 'DUPLICATE_EMAIL') {
        setError('email', {
          type: 'server',
          message: 'An account with this email already exists.',
        });
        return;
      }
      if (apiError.code === 'INVALID_INVITE_CODE') {
        setError('inviteCode', {
          type: 'server',
          message: apiError.message,
        });
        return;
      }
      Object.entries(fieldErrors).forEach(([field, message]) => {
        if (['name', 'email', 'password', 'role', 'inviteCode'].includes(field)) {
          setError(field, { type: 'server', message });
        }
      });
      if (Object.keys(fieldErrors).length === 0) setServerError(apiError.message);
    }
  };

  if (pendingTeacherUser) {
    return (
      <AuthShell
        description="Teacher accounts without an invite code require administrator verification before they can sign in."
        footer={
          <p>
            Ready to check your account?{' '}
            <Link className="link" to="/login">
              Return to sign in
            </Link>
          </p>
        }
        kicker="Approval required"
        title="Teacher account pending approval."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">Request submitted for {pendingTeacherUser.email}</p>
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              An administrator must activate your teacher account from the Users console before you can create exams or questions.
            </p>
          </div>
          <Link className="btn-primary block w-full text-center" to="/login">
            Return to Sign In
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description="Create a student or teacher account. Teacher registrations require an invite code or administrator approval."
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
          <Input
            autoComplete="email"
            id="email"
            placeholder="you@example.com"
            type="email"
            {...register('email')}
          />
        </Field>

        <Field error={errors.role?.message} htmlFor="role" label="I am a">
          <Select id="role" {...register('role')}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </Select>
        </Field>

        {selectedRole === 'teacher' && (
          <Field
            error={errors.inviteCode?.message}
            hint="Leave blank to submit your teacher account for administrator approval."
            htmlFor="inviteCode"
            label="Teacher invite code (optional)"
          >
            <Input
              autoComplete="off"
              id="inviteCode"
              placeholder="Optional invite code"
              {...register('inviteCode')}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={errors.password?.message} htmlFor="password" label="Password">
            <div className="relative">
              <Input
                autoComplete="new-password"
                className="pr-16"
                id="password"
                placeholder="8+ characters"
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-2 my-auto flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => setShowPassword((prev) => !prev)}
                type="button"
              >
                {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                <span>{showPassword ? 'Hide' : 'Show'}</span>
              </button>
            </div>
          </Field>
          <Field
            error={errors.confirmPassword?.message}
            htmlFor="confirmPassword"
            label="Confirm password"
          >
            <div className="relative">
              <Input
                autoComplete="new-password"
                className="pr-16"
                id="confirmPassword"
                placeholder="Repeat password"
                type={showConfirmPassword ? 'text' : 'password'}
                {...register('confirmPassword')}
              />
              <button
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-2 my-auto flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                type="button"
              >
                {showConfirmPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                <span>{showConfirmPassword ? 'Hide' : 'Show'}</span>
              </button>
            </div>
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
