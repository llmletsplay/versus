export type WSEventType =
  // Room events
  | 'room:join'
  | 'room:leave'
  | 'room:ready'
  | 'room:unready'
  | 'room:start'
  | 'room:update'
  | 'room:closed'
  | 'room:player_joined'
  | 'room:player_left'
  | 'room:player_ready'
  | 'room:player_unready'
  | 'room:cancelled'
  | 'room:game_started'
  | 'room:completed'
  // Game events
  | 'game:move'
  | 'game:state'
  | 'game:over'
  | 'game:error'
  // Chat events
  | 'chat:message'
  // Spectator events
  | 'spectator:join'
  | 'spectator:leave'
  | 'spectator:count'
  // Market events
  | 'market:update'
  | 'market:bet'
  | 'market:resolved'
  // Tournament events
  | 'tournament:update'
  | 'tournament:match_start'
  | 'tournament:match_end'
  | 'tournament:round_advance'
  // System events
  | 'system:ping'
  | 'system:pong'
  | 'system:error'
  | 'system:connected';

export interface WSMessage<T = unknown> {
  event: WSEventType;
  data: T;
  roomId?: string;
  timestamp: number;
}
