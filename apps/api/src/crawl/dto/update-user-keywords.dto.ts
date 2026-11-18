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
    example: '반도체 수출과 금리 인하 소식',
    description: '관심 한 줄. 검색 쿼리 시드로 쓴다.',
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
