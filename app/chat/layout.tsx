export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ width: '100%', padding: 'var(--mantine-spacing-md)' }}>
      {children}
    </div>
  );
} 