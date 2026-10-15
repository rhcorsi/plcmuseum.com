// Fictional field stories for component work and for the development stage (`pnpm dev`, ADR-0008 as amended).
// Stories are never committed; these are invented, signed by obviously fictional display names, and never reach a
// preview or production build (src/content/queries.ts).
import type { FieldStory } from '../content/types';

export const fixtureStories: FieldStory[] = [
  {
    id: 'st-fixture0001',
    exhibit_id: 'fx-octal-rack-or5',
    display_name: 'Fixture Person A',
    role: 'Fictional maintenance technician',
    country: 'BR',
    original_lang: 'pt',
    year_of_memory: 1991,
    text: 'História fictícia para testes: a fonte do bastidor desligava toda vez que alguém ligava a máquina de café do turno da noite.',
    consent: { publish_with_display_name: true, license: 'CC-BY-4.0', machine_translation: true },
    status: 'approved',
    submitted_at: '2026-10-01T12:00:00Z',
    approved_at: '2026-10-02T09:30:00Z',
    edited_note: null,
  },
  {
    id: 'st-fixture0002',
    exhibit_id: 'fx-octal-rack-or5',
    display_name: 'Fixture Person B',
    role: 'Fictional controls engineer',
    country: 'US',
    original_lang: 'en',
    year_of_memory: 1995,
    text: 'Fictional story for tests: we labeled every cable twice because the drawings were always one revision behind the cabinet.',
    consent: { publish_with_display_name: true, license: 'CC-BY-4.0', machine_translation: false },
    status: 'approved',
    submitted_at: '2026-10-03T08:15:00Z',
    approved_at: null,
    edited_note: null,
  },
  {
    id: 'st-fixture0003',
    exhibit_id: 'fx-process-hiway-ph1',
    display_name: 'Fixture Person C',
    role: null,
    country: 'DE',
    original_lang: 'de',
    year_of_memory: 1982,
    text: 'Erfundene Geschichte für Tests: Die Leitwarte war so warm, dass wir im Winter die Fenster öffnen mussten, damit die Rechner liefen.',
    consent: { publish_with_display_name: true, license: 'CC-BY-4.0', machine_translation: true },
    status: 'approved',
    submitted_at: '2026-10-05T17:40:00Z',
    approved_at: '2026-10-06T10:00:00Z',
    edited_note: null,
  },
];
