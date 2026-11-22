import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { FEEDBACK_VALUES, FeedbackValue } from '../article-feedback.entity';

export class SetFeedbackDto {
  @ApiProperty({ enum: FEEDBACK_VALUES, example: 'up' })
  @IsIn(FEEDBACK_VALUES)
  value: FeedbackValue;
}
