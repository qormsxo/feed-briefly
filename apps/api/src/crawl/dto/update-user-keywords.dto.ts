import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateUserKeywordsDto {
  @ApiPropertyOptional({
    example: '카리나, 엔비디아',
    description: '관심 키워드. 쉼표로 구분하고, 키워드가 들어간 기사만 따로 모은다.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  focus?: string;

  @ApiProperty({ example: ['부고', '운세'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  exclude: string[];
}
