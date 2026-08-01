import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HeroGallery } from './hero-gallery/hero-gallery';
import { GradientFooter } from './gradient-footer/gradient-footer';

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=1200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1498036882173-b41c28a8ba34?q=80&w=1200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1551641506-ee5bf4cb45f1?q=80&w=1200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?q=80&w=1200&auto=format&fit=crop',
];

interface Feature {
  icon: string;
  title: string;
  desc: string;
}

@Component({
  selector: 'app-landing',
  imports: [RouterLink, HeroGallery, GradientFooter],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  readonly heroImages = HERO_IMAGES;

  readonly features: Feature[] = [
    {
      icon: 'search',
      title: 'AI Omnisearch',
      desc: 'Tìm tệp bằng ngôn ngữ tự nhiên — "ảnh hoá đơn tháng trước" cũng ra ngay, không cần nhớ tên file.',
    },
    {
      icon: 'folder_open',
      title: 'Lăng kính linh hoạt',
      desc: 'Duyệt theo thư mục, loại tệp, gần đây hay được chia sẻ — cùng một kho, nhiều cách nhìn.',
    },
    {
      icon: 'group',
      title: 'Chia sẻ tức thì',
      desc: 'Gửi link công khai hoặc mời cộng tác viên, kiểm soát quyền xem/sửa theo từng tệp và thư mục.',
    },
    {
      icon: 'bolt',
      title: 'Tải lên nhanh, an toàn',
      desc: 'Kéo-thả cả thư mục, nén ảnh tự động, và mọi thứ đều nằm trong thùng rác có thể khôi phục.',
    },
  ];
}
