import type { RobotDefinition } from '../types';

export const ROBOTS: RobotDefinition[] = [
  { id: 'hammer-bot', name: 'Hammer Bot', color: '#f4c542', accent: '#241f14', marker: '▲', silhouette: 'hammer' },
  { id: 'hulk-x90', name: 'Hulk X90', color: '#e84d42', accent: '#321714', marker: '■', silhouette: 'tank' },
  { id: 'spin-bot', name: 'Spin Bot', color: '#30c67c', accent: '#0b2b1d', marker: '●', silhouette: 'spinner' },
  { id: 'squash-bot', name: 'Squash Bot', color: '#f58a35', accent: '#351b0a', marker: '◆', silhouette: 'crusher' },
  { id: 'trundle-bot', name: 'Trundle Bot', color: '#9672e8', accent: '#21163b', marker: '⬢', silhouette: 'hauler' },
  { id: 'twitch', name: 'Twitch', color: '#4fc9e8', accent: '#0c2932', marker: '✦', silhouette: 'antenna' },
  { id: 'twonky', name: 'Twonky', color: '#f164a5', accent: '#351323', marker: '✚', silhouette: 'walker' },
  { id: 'zoom-bot', name: 'Zoom Bot', color: '#efefea', accent: '#232626', marker: '➤', silhouette: 'racer' },
];

export const ROBOT_BY_ID = new Map(ROBOTS.map((robot) => [robot.id, robot]));
