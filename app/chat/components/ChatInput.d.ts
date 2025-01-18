export interface ChatInputProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>, model: string) => void;
  isLoading: boolean;
}

export declare function ChatInput(props: ChatInputProps): JSX.Element; 