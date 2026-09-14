import type { RobotDefinition } from '../types';

export const ROBOTS: RobotDefinition[] = [
  { id: 'hammer-bot', name: 'Hammer Bot', color: '#f4b52d', accent: '#49331f', marker: '▲', silhouette: 'hammer', modelUrl: '/assets/models/robots/hammer-bot.glb', portraitUrl: '/assets/images/robots/hammer-bot.webp' },
  { id: 'hulk-x90', name: 'Hulk X90', color: '#dd5149', accent: '#4f2528', marker: '■', silhouette: 'tank', modelUrl: '/assets/models/robots/hulk-x90.glb', portraitUrl: '/assets/images/robots/hulk-x90.webp' },
  { id: 'spin-bot', name: 'Spin Bot', color: '#65bd69', accent: '#274633', marker: '●', silhouette: 'spinner', modelUrl: '/assets/models/robots/spin-bot.glb', portraitUrl: '/assets/images/robots/spin-bot.webp' },
  { id: 'squash-bot', name: 'Squash Bot', color: '#ee7e3c', accent: '#573224', marker: '◆', silhouette: 'crusher', modelUrl: '/assets/models/robots/squash-bot.glb', portraitUrl: '/assets/images/robots/squash-bot.webp' },
  { id: 'trundle-bot', name: 'Trundle Bot', color: '#9f82c8', accent: '#392c52', marker: '⬢', silhouette: 'hauler', modelUrl: '/assets/models/robots/trundle-bot.glb', portraitUrl: '/assets/images/robots/trundle-bot.webp' },
  { id: 'twitch', name: 'Twitch', color: '#63c7d6', accent: '#254951', marker: '✦', silhouette: 'antenna', modelUrl: '/assets/models/robots/twitch.glb', portraitUrl: '/assets/images/robots/twitch.webp' },
  { id: 'twonky', name: 'Twonky', color: '#e988ad', accent: '#573047', marker: '✚', silhouette: 'walker', modelUrl: '/assets/models/robots/twonky.glb', portraitUrl: '/assets/images/robots/twonky.webp' },
  { id: 'zoom-bot', name: 'Zoom Bot', color: '#eee4d4', accent: '#45454c', marker: '➤', silhouette: 'racer', modelUrl: '/assets/models/robots/zoom-bot.glb', portraitUrl: '/assets/images/robots/zoom-bot.webp' },
];

export const ROBOT_BY_ID = new Map(ROBOTS.map((robot) => [robot.id, robot]));
