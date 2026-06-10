# HanmirTalk 사내 서버 도메인 연결 질문지

작성일: 2026-06-09

## 1. 현재 상황 요약

HanmirTalk는 Proxmox 위 Ubuntu VM에 올릴 사내 업무용 웹앱입니다.

- VM: Proxmox 게스트 Ubuntu 26.04
- 현재 VM 이름: `hanmir-dev`
- 현재 VM 내부 IP: `192.168.0.111`
- 도메인: `hanmirworks.space`
- 도메인 구매처/DNS 관리: Vercel
- 현재 사내망:
  - 3층: `192.168.0.xxx`
  - 1층: `192.168.1.xxx`
  - 내부 IP는 DHCP라 바뀔 수 있음
- 고정 공인 IP는 비용 문제로 사용하지 않는 방향

프로젝트 실행 구조:

```text
사용자 브라우저
  -> 도메인 hanmirworks.space
  -> Caddy reverse proxy
  -> Next.js web container
  -> Express API + Socket.IO server container
  -> PostgreSQL container
```

컨테이너 구성:

- `caddy`: 외부 HTTP/HTTPS 진입점
- `web`: Next.js, 내부 포트 `3000`
- `server`: Express API + Socket.IO, 내부 포트 `4000`
- `postgres`: PostgreSQL 16, 외부 노출 금지
- 파일 업로드: VM 로컬 디스크 `/srv/hanmir-talk/uploads`

외부로 열어야 하는 포트는 원칙적으로 `80`, `443`뿐입니다. `3000`, `4000`, `5432`는 외부에 열면 안 됩니다.

## 2. 현재 방식에서 생길 수 있는 문제

`192.168.x.x`는 사설 IP입니다. 회사 내부에서만 의미가 있고, LTE/5G 같은 외부 인터넷에서는 직접 접근할 수 없습니다.

예상 문제:

- VM IP가 `192.168.0.111`에서 다른 값으로 바뀌면 접속 설정이 깨짐
- 3층 `192.168.0.xxx`에서는 접속되지만 1층 `192.168.1.xxx`에서는 안 될 수 있음
- 외부 핸드폰/LTE에서는 `192.168.0.111`로 접속 불가
- 도메인을 회사 공인 IP로 연결해도 공인 IP가 바뀌면 접속 불가
- 공유기/방화벽이 NAT Loopback을 지원하지 않으면 사내에서 `hanmirworks.space` 접속이 안 될 수 있음
- 회사 인터넷이 CGNAT이면 포트포워딩을 해도 외부 접속이 안 될 수 있음

## 3. 먼저 확인해야 할 네트워크 질문

이 질문은 사내 네트워크 담당자, 인터넷 설치 기사, 통신사 상담원, 또는 생성형 AI에게 그대로 전달해도 됩니다.

### 기본 회선 정보

1. 현재 회사 인터넷 통신사는 어디인가요? KT, SK브로드밴드, LG U+, 지역 케이블 중 어느 회선인가요?
2. 현재 회선은 가정용, 소상공인용, 기업용, 전용회선 중 무엇인가요?
3. 공유기 또는 방화벽 장비의 제조사/모델명은 무엇인가요?
4. 인터넷 모뎀과 사내 공유기/방화벽이 몇 대 연결되어 있나요?
5. 공인 IP가 공유기 WAN에 직접 들어오나요, 아니면 상위 장비에서 한 번 더 NAT가 걸려 있나요?

### 공인 IP / CGNAT 확인

6. 공유기 WAN IP가 무엇인가요?
7. 같은 장소 PC에서 `whatismyip`, `ipinfo.io`, `ifconfig.me` 등으로 보이는 외부 IP와 공유기 WAN IP가 같은가요?
8. 공유기 WAN IP가 `10.x.x.x`, `172.16.x.x ~ 172.31.x.x`, `192.168.x.x`, `100.64.x.x ~ 100.127.x.x` 중 하나인가요?
9. 위 대역이면 CGNAT 또는 이중 NAT 가능성이 있는데, 통신사에서 외부 포트포워딩이 가능한 구조인가요?

### 내부망 확인

10. 1층 `192.168.1.xxx`에서 3층 VM `192.168.0.111`로 ping이 되나요?
11. 1층에서 `192.168.0.111:80`, `192.168.0.111:443` 접속이 가능한가요?
12. `192.168.0.0/24`와 `192.168.1.0/24` 사이에 라우팅이 설정되어 있나요?
13. 층별 공유기가 각각 NAT를 하고 있나요, 아니면 하나의 중앙 라우터/방화벽이 VLAN을 관리하나요?
14. VM의 MAC 주소에 대해 DHCP 예약을 걸어 항상 `192.168.0.111`을 받게 할 수 있나요?

### 외부 접속 정책

15. 회사 보안 정책상 사내 서버를 외부 인터넷에 공개해도 되나요?
16. 공개한다면 허용 포트는 `443`만 가능한가요, `80`도 가능한가요?
17. 포트포워딩을 할 수 있나요?
18. 공유기/방화벽에서 `80 -> 192.168.0.111:80`, `443 -> 192.168.0.111:443` 설정이 가능한가요?
19. NAT Loopback 또는 Hairpin NAT를 지원하나요?
20. 외부 공개 대신 VPN, 터널, Zero Trust 방식이 더 적합한가요?

## 4. 가능한 구성안 비교

### A안. 고정 공인 IP + 포트포워딩

가장 전통적인 방식입니다.

```text
hanmirworks.space
  -> 고정 공인 IP
  -> 공유기/방화벽 80,443 포트포워딩
  -> 192.168.0.111
  -> Caddy
```

장점:

- 구조가 단순함
- Caddy가 Let's Encrypt 인증서를 자동 발급하기 쉬움
- 외부 사용자도 브라우저만 있으면 접속 가능

단점:

- 고정 공인 IP 비용 발생
- 포트포워딩/방화벽 설정 필요
- 사내 서버가 인터넷에 직접 노출됨
- 1층/3층 내부 라우팅 문제는 별도로 해결해야 함

현재 회사에서 고정 IP가 비싸서 쓰지 않는다고 답변받은 상태라면, 이 방식은 우선순위를 낮추는 것이 맞습니다.

### B안. 유동 공인 IP + DDNS 또는 Vercel DNS 자동 갱신

공인 IP는 유동이지만, IP가 바뀔 때마다 DNS를 자동 갱신하는 방식입니다.

장점:

- 고정 IP 요금을 피할 수 있음
- 브라우저에서 `hanmirworks.space`로 접속 가능

단점:

- 공유기 WAN에 실제 공인 IP가 있어야 함
- CGNAT이면 동작하지 않음
- 포트포워딩은 여전히 필요
- IP 변경 직후 DNS 갱신 전까지 접속 장애 가능
- 자동 갱신 스크립트 운영 부담이 있음
- 사내 서버가 인터넷에 직접 노출됨

초보 운영에는 추천도가 낮습니다. 고정 IP 비용은 피하지만 운영 난이도가 올라갑니다.

### C안. Cloudflare Tunnel

현재 상황에서 가장 현실적인 후보입니다.

```text
사용자
  -> https://hanmirworks.space
  -> Cloudflare
  -> VM 내부의 cloudflared가 만든 outbound tunnel
  -> Caddy 또는 web service
```

장점:

- 고정 공인 IP가 필요 없음
- 공유기 포트포워딩이 필요 없음
- CGNAT 환경에서도 가능성이 높음
- 1층/3층 사내망 분리 문제 영향을 덜 받음
- 외부 핸드폰/LTE에서도 도메인으로 접속 가능
- 사내 서버에 inbound 포트를 열지 않음

단점:

- Cloudflare 계정과 터널 설정이 필요
- 보통 도메인의 DNS 관리를 Cloudflare로 옮기는 편이 가장 쉽고 안정적임
- 현재 도메인은 Vercel에서 구매했으므로, Vercel에서 nameserver 변경이 가능한지 확인해야 함
- 회사 보안 정책상 Cloudflare를 경유해도 되는지 확인 필요

추천:

- 고정 공인 IP를 쓰지 않는다면 1순위로 검토
- `hanmirworks.space`는 Vercel에서 계속 소유하되 DNS nameserver만 Cloudflare로 넘기는 방식 검토
- Cloudflare Tunnel은 inbound port 없이 outbound 연결로 동작하므로 현재 문제와 잘 맞음

### D안. Tailscale

직원들이 Tailscale 클라이언트를 설치하고 사내 서버에 접속하는 방식입니다.

장점:

- 외부 포트 공개가 필요 없음
- 관리자용 접근, 개발/운영 점검용으로 좋음
- 외부에서 SSH/관리 작업하기 좋음

단점:

- 모든 직원 기기에 Tailscale 설치와 로그인이 필요
- 일반 웹서비스처럼 `hanmirworks.space`만 입력해서 접속하는 경험과 다름
- 직원 수가 늘면 계정/권한 관리가 필요

추천:

- 운영자/관리자 접근용 보조 수단으로 추천
- 전 직원 서비스 접속용 주 경로로는 Cloudflare Tunnel이 더 단순함

### E안. 저가 VPS를 앞단 프록시로 사용

월 몇 달러~몇 만 원 수준의 클라우드 서버를 하나 두고, 사내 VM과 outbound tunnel 또는 WireGuard로 연결하는 방식입니다.

장점:

- 고정 공인 IP가 있는 서버를 저렴하게 확보 가능
- Cloudflare 의존도를 줄일 수 있음
- 구조를 직접 통제 가능

단점:

- VPS 보안/업데이트/프록시 운영 필요
- 초보자에게는 운영 난이도가 있음
- 사내 VM과 VPS 사이 터널 구성 필요

추천:

- Cloudflare 사용이 정책상 어렵거나, 직접 제어가 꼭 필요할 때만 검토

## 5. 현재 추천 결론

현재 조건:

- 고정 공인 IP는 비용 때문에 사용하지 않음
- 층별 사내망이 `192.168.0.xxx`, `192.168.1.xxx`로 분리되어 있음
- 외부 핸드폰에서도 접속해야 함
- 초보자도 운영 가능한 구성이 필요함

추천 순서:

1. Cloudflare Tunnel
2. Tailscale은 관리자/개발자 접근 보조용
3. 유동 공인 IP + DDNS는 차선
4. 고정 공인 IP + 포트포워딩은 비용 승인 시에만

가장 추천하는 구조:

```text
hanmirworks.space
  -> Cloudflare DNS
  -> Cloudflare Tunnel
  -> Ubuntu VM의 cloudflared
  -> Caddy
  -> web/server/postgres containers
```

이 구조에서는 사내 인터넷 공인 IP가 바뀌어도 큰 영향이 없습니다. VM이 인터넷으로 outbound 연결만 만들 수 있으면 됩니다.

## 6. 고정 공인 IP 비용과 신청처

요금은 통신사, 약정, 결합, 지역, 기존 회선 종류에 따라 달라집니다. 아래는 2026-06-09 기준 공개 페이지 확인 내용입니다.

### KT

KT Enterprise 오피스넷 고정 IP 상품은 3년 약정 기준으로 대략 다음 범위입니다.

- 슬림 100M급: 월 41,800원
- 베이직 500M급: 월 49,500원
- 에센스 1G급: 월 55,000원
- 상위 상품은 월 60,500원 이상

KT 공식 페이지는 오피스넷 고정 IP를 오피스넷 이용 고객용 부가서비스로 안내하며, 회선당 최대 3개까지 가능하다고 설명합니다. 신규/이전 설치 출동비도 별도로 발생할 수 있습니다.

신청/문의:

- KT 기업상품: `1588-0114`
- KT Enterprise 오피스넷 페이지

### SK브로드밴드

SK브로드밴드 기업 초고속인터넷 공식 페이지 기준:

- Biz인터넷 100M 고정 IP: 월 44,000원
- GigaBiz 라이트 500M 고정 IP: 월 49,500원
- GigaBiz 1G 고정 IP: 월 55,000원
- GigaBiz 프리미엄 1G 고정 IP: 월 55,000원

공식 페이지에 기업고객센터와 기업가입전담센터가 안내되어 있습니다.

신청/문의:

- 기업고객센터: `1600-0108`
- 기업가입전담센터: `1670-0099`
- SK브로드밴드 기업 초고속인터넷 페이지

### LG U+

LG U+ 오피스넷 공식 페이지 기준:

- 100M 단독 고정 IP, 3년 약정: 월 41,800원
- 500M 단독 고정 IP, 3년 약정: 월 49,500원
- 1G 단독 고정 IP, 3년 약정: 월 60,500원
- 결합 상품 이용 시 일부 요금이 낮아질 수 있음

LG U+는 고정 IP가 유동 IP 1개와 필수로 사용되어야 하며, 한 회선에 최대 20개까지 사용할 수 있다고 안내합니다.

신청/문의:

- LG U+ 기업고객센터: `1544-0001`
- LG U+ 오피스넷 페이지

## 7. 생성형 AI에게 그대로 물어볼 질문 프롬프트

아래 내용을 복사해서 생성형 AI, 네트워크 담당자, 또는 통신사 상담 전 정리용으로 사용하세요.

```text
우리는 사내 Proxmox 서버에 HanmirTalk라는 업무용 웹앱을 배포하려고 합니다.

현재 구성:
- Proxmox 위 Ubuntu 26.04 VM
- 현재 VM 내부 IP: 192.168.0.111
- 앱은 Docker Compose로 실행
- 구성: Caddy reverse proxy, Next.js web, Express API + Socket.IO, PostgreSQL
- 외부 공개가 필요한 포트는 80/443만
- PostgreSQL 5432, web 3000, API 4000은 외부 노출 금지
- 도메인: hanmirworks.space
- 도메인은 Vercel에서 구매했고 DNS Records 설정 가능
- 3층 사내망은 192.168.0.xxx
- 1층 사내망은 192.168.1.xxx
- 내부 IP는 DHCP라 바뀔 수 있음
- 고정 공인 IP는 비용이 비싸서 사용하지 않는 방향
- 직원들이 사내 1층/3층, 외부 핸드폰 LTE/5G에서도 https://hanmirworks.space 로 접속하길 원함

질문:
1. 우리 상황에서 고정 공인 IP 없이 안정적으로 운영하려면 Cloudflare Tunnel, DDNS, Tailscale, VPS reverse proxy 중 무엇이 가장 적합한가요?
2. 초보자가 운영하기 쉬운 순서로 추천해 주세요.
3. Cloudflare Tunnel을 쓴다면 Vercel에서 구매한 hanmirworks.space 도메인을 어떻게 연결해야 하나요?
4. Vercel에서 DNS만 관리하는 방식과 Cloudflare로 nameserver를 옮기는 방식의 차이를 설명해 주세요.
5. 사내 1층 192.168.1.xxx와 3층 192.168.0.xxx가 나뉘어 있을 때 내부 접속 문제를 어떻게 진단해야 하나요?
6. CGNAT 여부는 어떻게 확인하나요?
7. 공유기 포트포워딩 없이 외부 접속을 만들 수 있는 방식의 장단점은 무엇인가요?
8. 보안상 Caddy, Docker Compose, PostgreSQL, 파일 업로드 디렉터리는 어떻게 보호해야 하나요?
9. 초보자 기준으로 실제 구축 순서를 1단계부터 자세히 작성해 주세요.
10. 장애가 났을 때 DNS 문제, 터널 문제, VM 문제, Docker 문제를 어떻게 구분해서 점검해야 하나요?

최종 목표:
- 사용자는 브라우저에서 https://hanmirworks.space 로 접속
- 서버는 사내 Proxmox VM에 유지
- 고정 공인 IP는 사용하지 않음
- 외부 포트포워딩도 가능하면 피하고 싶음
- HTTPS와 안정적인 접속이 필요함
```

## 8. 통신사/네트워크 업체에 물어볼 질문

아래 질문은 전화 상담 또는 현장 업체에게 전달하면 됩니다.

```text
사내 Proxmox 서버에 웹서비스를 운영하려고 합니다.
고정 공인 IP는 비용 문제로 사용하지 않으려 합니다.

확인 부탁드립니다.

1. 현재 회선이 CGNAT인가요, 실제 공인 IP가 공유기 WAN에 들어오나요?
2. 현재 공인 IP가 유동이라면 평균적으로 얼마나 자주 바뀌나요?
3. 현재 공유기/방화벽에서 80/443 포트포워딩이 가능한가요?
4. 포트포워딩 없이 Cloudflare Tunnel 같은 outbound tunnel을 써도 회선 정책상 문제가 없나요?
5. 1층 192.168.1.xxx와 3층 192.168.0.xxx 사이 라우팅이 가능한가요?
6. VM 192.168.0.111을 DHCP 예약으로 고정할 수 있나요?
7. NAT Loopback/Hairpin NAT를 지원하나요?
8. 내부 DNS 또는 사내 DNS에서 hanmirworks.space를 내부 IP로 분기할 수 있나요?
9. 외부 접속용으로 고정 IP를 추가할 경우 월 비용, 설치비, 약정, 해지 위약금은 얼마인가요?
10. 기존 회선을 기업용 오피스넷으로 바꾸지 않고 고정 IP만 추가할 수 있나요?
```

## 9. 다음 실행 체크리스트

1. VM 내부 IP를 DHCP 예약으로 고정한다.
2. 1층 PC에서 `192.168.0.111`로 접속 가능한지 확인한다.
3. 공유기 WAN IP와 외부 조회 IP가 같은지 확인해 CGNAT 여부를 판단한다.
4. 고정 IP를 쓰지 않을 것이 확정이면 Cloudflare 계정을 만든다.
5. `hanmirworks.space`의 DNS를 Cloudflare에서 관리할 수 있는지 확인한다.
6. Cloudflare Tunnel로 `hanmirworks.space`를 VM의 Caddy 또는 web 서비스에 연결한다.
7. Docker Compose로 앱을 올린다.
8. 외부 LTE/5G에서 `https://hanmirworks.space` 접속을 테스트한다.
9. 백업 스크립트와 복원 절차를 별도로 점검한다.

## 10. 참고 링크

- Vercel DNS 관리: https://vercel.com/kb/guide/how-to-manage-vercel-dns-records
- Cloudflare Tunnel 문서: https://developers.cloudflare.com/tunnel/
- Cloudflare Zero Trust 요금: https://www.cloudflare.com/plans/zero-trust-services/
- KT 오피스넷: https://enterprise.kt.com/pd/P_PD_NW_GI_003.do
- KT 문의/연락처: https://corp.kt.com/html/etc/contact.html
- SK브로드밴드 기업 초고속인터넷: https://biz.skbroadband.com/page.do?menu_id=P05010000
- LG U+ 오피스넷: https://www.lguplus.com/biz/all/telecom/internet-cctv/officenet/B000000005
- LG U+ 가입 방법: https://www.lguplus.com/biz/support/service-info/register-guide
