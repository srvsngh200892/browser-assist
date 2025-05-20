import { WELCOME_MESSAGE } from '../../constants/messages';

describe('Message Constants', () => {
    describe('WELCOME_MESSAGE', () => {
        it('should be defined', () => {
            expect(WELCOME_MESSAGE).toBeDefined();
        });

        it('should be an array with one message', () => {
            expect(Array.isArray(WELCOME_MESSAGE)).toBe(true);
            expect(WELCOME_MESSAGE.length).toBe(1);
        });

        it('should have the correct message structure', () => {
            const message = WELCOME_MESSAGE[0];

            expect(message).toEqual(expect.objectContaining({
                role: 'assistant',
                content: expect.any(String),
                id: 'welcome-message',
                is_welcome: true,
                created_at: expect.any(String)
            }));
        });

        it('should have a valid ISO date string for created_at', () => {
            const message = WELCOME_MESSAGE[0];
            expect(() => new Date(message.created_at)).not.toThrow();
        });

        it('should have the correct welcome message content', () => {
            const message = WELCOME_MESSAGE[0];
            expect(message.content).toBe('Welcome! I\'m here to help you with your questions and tasks. How can I assist you today?');
        });
    });
}); 