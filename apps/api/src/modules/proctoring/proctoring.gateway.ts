import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

/**
 * Kênh thời gian thực cho màn hình giám sát (chức năng 5.7) và cảnh báo
 * trực tiếp tới màn hình sinh viên (chức năng 5.5).
 *
 * Phòng theo quy ước:
 *   exam:<examId>       — giảng viên đang mở màn giám sát ca thi đó
 *   attempt:<attemptId> — một thí sinh đang làm bài
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ProctoringGateway {
  private readonly logger = new Logger(ProctoringGateway.name);

  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('monitor:join')
  joinExam(@MessageBody() data: { examId: string }, @ConnectedSocket() client: Socket) {
    client.join(`exam:${data.examId}`);
    return { joined: `exam:${data.examId}` };
  }

  @SubscribeMessage('attempt:join')
  joinAttempt(@MessageBody() data: { attemptId: string }, @ConnectedSocket() client: Socket) {
    client.join(`attempt:${data.attemptId}`);
    return { joined: `attempt:${data.attemptId}` };
  }

  /** Đẩy một dòng cập nhật lên bảng giám sát của giảng viên. */
  pushMonitorUpdate(examId: string, payload: unknown) {
    this.server?.to(`exam:${examId}`).emit('monitor:update', payload);
  }

  /** Cảnh báo hiện ngay trên màn hình thí sinh — chức năng 5.5. */
  warnStudent(attemptId: string, payload: unknown) {
    this.server?.to(`attempt:${attemptId}`).emit('proctor:warning', payload);
  }

  /** Buộc nộp bài khi vượt ngưỡng — chức năng 5.6. */
  forceSubmit(attemptId: string, reason: string) {
    this.server?.to(`attempt:${attemptId}`).emit('proctor:force-submit', { reason });
  }
}
