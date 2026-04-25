"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Создаём аккаунт...");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Аккаунт создан. Проверь email для подтверждения.");
  }

  return (
    <main className="min-h-screen bg-[#070b16] px-6 py-10 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8">
        <p className="text-sm uppercase tracking-[0.25em] text-white/40">
          SkillEdge AI
        </p>

        <h1 className="mt-4 text-4xl font-semibold">Регистрация</h1>

        <form onSubmit={handleRegister} className="mt-8 space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Пароль"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          <button className="w-full rounded-full bg-white px-6 py-3 font-medium text-black">
            Зарегистрироваться
          </button>
        </form>

        {status && <p className="mt-5 text-sm text-white/60">{status}</p>}

        <a href="/login" className="mt-6 block text-sm text-white/50 hover:text-white">
          Уже есть аккаунт? Войти
        </a>
      </div>
    </main>
  );
}