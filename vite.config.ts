import { defineConfig } from 'vite';
import { imagetools } from 'vite-imagetools';

export default defineConfig({
    plugins: [
        imagetools({
            defaultDirectives: (url) => {
                // Background images: keep original size, high quality webp
                if (url.pathname.includes('/backgrounds/')) {
                    return new URLSearchParams({
                        format: 'webp',
                        quality: '90'
                    });
                }
                // Other images: resize and compress
                return new URLSearchParams({
                    format: 'webp',
                    w: '800',
                    quality: '60'
                });
            }
        })
    ]
});
