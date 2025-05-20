import { PLACEHOLDER_IMAGE } from '../../constants/images';

describe('Image Constants', () => {
    describe('PLACEHOLDER_IMAGE', () => {
        it('should be defined', () => {
            expect(PLACEHOLDER_IMAGE).toBeDefined();
        });

        it('should be a valid base64 encoded SVG', () => {
            expect(PLACEHOLDER_IMAGE).toMatch(/^data:image\/svg\+xml;base64,/);

            // Decode base64 and check if it's valid SVG
            const base64Data = PLACEHOLDER_IMAGE.split(',')[1];
            const decodedSvg = Buffer.from(base64Data, 'base64').toString();

            expect(decodedSvg).toMatch(/<svg/);
            expect(decodedSvg).toMatch(/<\/svg>/);
        });

        it('should contain required SVG elements', () => {
            const base64Data = PLACEHOLDER_IMAGE.split(',')[1];
            const decodedSvg = Buffer.from(base64Data, 'base64').toString();

            // Check for required elements
            expect(decodedSvg).toContain('<rect');
            expect(decodedSvg).toContain('<text');
            expect(decodedSvg).toContain('Browser Preview');
            expect(decodedSvg).toContain('No live preview available');
        });
    });
}); 