import * as React from 'react';

export function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...props}>
      <path
        fill="currentColor"
        d="M21.35 11.1h-8.18v2.95h4.69C20.23 14.4 22 16.6 22 19.3c0 1.3-.3 2.1-.8 2.9l-4.3 3.3C18.5 24.4 20.2 25 22 25c2 0 3.7-.6 5-1.7l-4.3-3.3c.5-.5.8-1.2.8-2 0-.8-.3-1.4-.8-1.9-.5-.5-1.1-.7-1.8-.7h-6.2V11.1z"
      />
      <path
        fill="currentColor"
        d="M6.3 14.3l-2.9-2.2C4.5 10.5 5 8.5 6.3 7.1l3.1 2.4c-.4 1.1-.4 2.3 0 3.4l-3.1 1.4z"
        opacity=".6"
      />
      <path
        fill="currentColor"
        d="M14.2 18.3l3.1-2.4c-1.3-1.4-1.8-3.4-1.1-5.2l-3.1-1.2v4.8z"
        opacity=".6"
      />
    </svg>
  );
}
