import { Injectable } from '@nestjs/common';
import { User } from '../users/user.entity';
import { KakaoApiClient } from './kakao-api.client';

export type KakaoLink = {
  web_url: string;
  mobile_web_url: string;
};

export type KakaoTextTemplate = {
  object_type: 'text';
  text: string;
  link: KakaoLink;
  buttons?: Array<{ title: string; link: KakaoLink }>;
};

@Injectable()
export class KakaoTalkService {
  constructor(private readonly kakao: KakaoApiClient) {}

  sendMemoToMe(user: User, template: KakaoTextTemplate) {
    const body = new URLSearchParams({
      template_object: JSON.stringify(template),
    });

    return this.kakao.request(user, {
      method: 'POST',
      url: '/v2/api/talk/memo/default/send',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: body.toString(),
    });
  }
}
