import React from 'react';

/**
 * Simple Markdown to JSX renderer for images and basic formatting.
 * Used as a reliable alternative when external libraries are unavailable.
 */
export function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;
  
  // Pre-process content to handle common markdown patterns
  const lines = content.split('\n');
  const renderedLines = lines.map((line) => {
    // Images: ![Alt](url)
    if (line.match(/!\[(.*?)\]\((.*?)\)/)) {
      return line.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
        return `<img src="${url}" alt="${alt}" class="rounded-xl shadow-lg my-10 mx-auto border border-primary/10 transition-transform duration-500 hover:scale-[1.03] block max-w-full h-auto" />`;
      });
    }

    // Headers: # H1, ## H2, ### H3
    if (line.startsWith('# ')) return `<h1 class="text-4xl font-extrabold mb-8 text-foreground tracking-tight leading-tight">${line.slice(2)}</h1>`;
    if (line.startsWith('## ')) return `<h2 class="text-2xl font-bold mt-12 mb-6 text-foreground/90 border-b border-primary/5 pb-2">${line.slice(3)}</h2>`;
    if (line.startsWith('### ')) return `<h3 class="text-xl font-semibold mt-8 mb-4 text-foreground/80">${line.slice(4)}</h3>`;
    
    // Lists: - item or * item
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      return `<li class="list-disc ml-6 my-2 text-lg text-muted-foreground/90 marker:text-primary/50">${line.trim().replace(/^[-*]\s+/, '')}</li>`;
    }

    // Bold: **text**
    let processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-foreground/90">$1</strong>');
    
    // Simple line breaks for empty lines
    if (!processedLine.trim()) return '<div class="h-4"></div>';

    return `<div>${processedLine}</div>`;
  });

  return (
    <div 
      className="markdown-preview prose prose-teal dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: renderedLines.join('\n') }}
    />
  );
}
