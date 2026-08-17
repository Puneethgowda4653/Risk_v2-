// src/utils/reportPdf.js
//
// Produces the DELIVERED Risk Assessment PDF using the finalized template
// design. It renders the same pages produced by riskReportHtml.js (identical
// layout + real dashboard-consistent data), rasterizing each A4 page into a
// multi-page PDF.
//
// Each page is mounted in its OWN small, isolated iframe and captured
// individually. This is deliberate: html2canvas clones the entire document on
// every call, so rendering one 15-page document 15 times is O(n²) and can hang.
// One page per iframe keeps every capture cheap and reliable.
//
// Replaces the old hand-drawn jsPDF report (pdfGenerator.js) as the deliverable.
// Same return contract as the old generatePDF: returns { blob, filename } and
// also triggers a local download.

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { buildReportPages, REPORT_HEAD } from './riskReportHtml';

const A4 = { w: 210, h: 297 }; // mm

// Promise that resolves after web fonts settle, but never hangs (fonts.ready
// can stall if the font CDN is slow/blocked — we cap the wait and proceed).
function fontsSettled(doc, capMs) {
  const cap = new Promise((res) => setTimeout(res, capMs));
  const ready = doc.fonts && doc.fonts.ready ? doc.fonts.ready.catch(() => {}) : Promise.resolve();
  return Promise.race([Promise.all([ready]).catch(() => {}), cap]);
}

// Mount a single page's HTML in an isolated offscreen iframe and return it.
function mountPage(pageHtml) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      position: 'fixed', left: '-10000px', top: '0',
      width: '230mm', height: '320mm', border: '0', background: '#ffffff',
    });
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>${REPORT_HEAD}</head><body style="background:#fff;">${pageHtml}</body></html>`);
    doc.close();
    setTimeout(() => resolve(iframe), 0);
  });
}

export async function generateReportPdf(result, metadata) {
  const pages = buildReportPages(result, metadata);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < pages.length; i++) {
    const iframe = await mountPage(pages[i]);
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win.document;
    try {
      await fontsSettled(doc, 1500);
      // Ensure images (logo/data-URI) are decoded.
      await Promise.all(Array.from(doc.images || []).map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(); })));
      await new Promise((r) => (win.requestAnimationFrame ? win.requestAnimationFrame(() => setTimeout(r, 30)) : setTimeout(r, 60)));

      const el = doc.querySelector('.page, .wp-page') || doc.body;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, A4.w, A4.h, undefined, 'FAST');
    } finally {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
  }

  const filename = `Risk_Assessment_${String(metadata.companyName || metadata.name || 'report').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(filename);
  return { blob: pdf.output('blob'), filename };
}

export default generateReportPdf;
