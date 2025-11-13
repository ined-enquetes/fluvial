const COOKIE_NAME = 'surveyUserName';

export const getUserNameFromCookie = (): string | null => {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';');
  const cookie = cookies.find(c => c.trim().startsWith(`${COOKIE_NAME}=`));
  
  if (!cookie) return null;
  
  const value = cookie.split('=')[1];
  return value ? decodeURIComponent(value) : null;
};

export const setUserNameCookie = (name: string): void => {
  if (typeof document === 'undefined') return;
  
  // Cookie permanent (10 ans)
  const maxAge = 10 * 365 * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(name)}; path=/; max-age=${maxAge}; SameSite=Lax`;
};

export const deleteUserNameCookie = (): void => {
  if (typeof document === 'undefined') return;
  
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
};
