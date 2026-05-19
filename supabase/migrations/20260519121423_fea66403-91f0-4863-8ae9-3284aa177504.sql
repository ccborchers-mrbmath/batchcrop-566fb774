
-- Sessions table: one auto-saved session per user
CREATE TABLE public.user_sessions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  file_paths TEXT[] NOT NULL DEFAULT '{}',
  file_names TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own session" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own session" ON public.user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own session" ON public.user_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own session" ON public.user_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Private bucket for user uploaded source files
INSERT INTO storage.buckets (id, name, public) VALUES ('user-files', 'user-files', false);

CREATE POLICY "users read own files" ON storage.objects
  FOR SELECT USING (bucket_id = 'user-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users upload own files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'user-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users update own files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'user-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users delete own files" ON storage.objects
  FOR DELETE USING (bucket_id = 'user-files' AND auth.uid()::text = (storage.foldername(name))[1]);
