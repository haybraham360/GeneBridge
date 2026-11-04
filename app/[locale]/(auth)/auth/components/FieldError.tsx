import { CircleAlert } from 'lucide-react';
import { errorClasses } from './styles';

/** Inline error, linked to its field with aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className={`flex items-start gap-1.5 ${errorClasses}`}>
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
