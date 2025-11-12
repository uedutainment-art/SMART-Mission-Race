/**
 * NFC 모듈
 * Web NFC API를 사용하여 NFC 태그 읽기/쓰기 기능 제공
 */

let ndefReader = null;
let isScanning = false;

/**
 * NFC 지원 여부 확인
 * @returns {boolean}
 */
export function isNFCSupported() {
  return 'NDEFReader' in window;
}

/**
 * NFC 태그에서 팀 정보 읽기
 * @returns {Promise<{teamId: string, teamNumber: number, teamName: string, serialNumber: string}>}
 */
export async function scanNFCForTeam() {
  if (!isNFCSupported()) {
    throw new Error('이 브라우저는 NFC를 지원하지 않습니다. Android Chrome을 사용해주세요.');
  }

  return new Promise(async (resolve, reject) => {
    try {
      ndefReader = new NDEFReader();
      await ndefReader.scan();
      isScanning = true;

      console.log('NFC 스캔 대기 중...');

      const timeoutId = setTimeout(() => {
        isScanning = false;
        reject(new Error('NFC 태그 스캔 시간이 초과되었습니다. 다시 시도해주세요.'));
      }, 30000); // 30초 타임아웃

      ndefReader.addEventListener('reading', ({ message, serialNumber }) => {
        clearTimeout(timeoutId);
        isScanning = false;

        console.log('NFC 태그 감지:', serialNumber);

        try {
          let teamData = null;

          for (const record of message.records) {
            const decoder = new TextDecoder(record.encoding || 'utf-8');
            const text = decoder.decode(record.data);

            console.log('NFC 레코드:', {
              recordType: record.recordType,
              data: text
            });

            // JSON 파싱 시도
            try {
              const parsed = JSON.parse(text);
              if (parsed.teamId) {
                teamData = {
                  teamId: parsed.teamId,
                  teamNumber: parsed.teamNumber || null,
                  teamName: parsed.teamName || '',
                  serialNumber: serialNumber
                };
                break;
              }
            } catch (e) {
              // JSON이 아닌 경우 무시
            }
          }

          if (teamData) {
            resolve(teamData);
          } else {
            reject(new Error('유효한 팀 정보가 없는 NFC 태그입니다.'));
          }
        } catch (error) {
          reject(error);
        }
      });

      ndefReader.addEventListener('readingerror', () => {
        clearTimeout(timeoutId);
        isScanning = false;
        reject(new Error('NFC 태그를 읽을 수 없습니다. 다시 시도해주세요.'));
      });

    } catch (error) {
      isScanning = false;
      console.error('NFC 스캔 오류:', error);
      
      if (error.name === 'NotAllowedError') {
        reject(new Error('NFC 권한이 거부되었습니다. 브라우저 설정을 확인해주세요.'));
      } else {
        reject(error);
      }
    }
  });
}

/**
 * NFC 태그에 팀 정보 쓰기
 * @param {{teamId: string, teamNumber: number, teamName: string}} teamData
 * @returns {Promise<void>}
 */
export async function writeTeamToNFC(teamData) {
  if (!isNFCSupported()) {
    throw new Error('이 브라우저는 NFC를 지원하지 않습니다.');
  }

  if (!teamData.teamId) {
    throw new Error('팀 ID는 필수입니다.');
  }

  try {
    const ndef = new NDEFReader();
    
    await ndef.write({
      records: [
        {
          recordType: "text",
          data: JSON.stringify({
            teamId: teamData.teamId,
            teamNumber: teamData.teamNumber || null,
            teamName: teamData.teamName || '',
            createdAt: Date.now()
          })
        }
      ]
    });

    console.log('NFC 태그에 팀 정보 저장 완료:', teamData);
  } catch (error) {
    console.error('NFC 쓰기 오류:', error);
    
    if (error.name === 'NotAllowedError') {
      throw new Error('NFC 쓰기 권한이 거부되었습니다.');
    } else if (error.name === 'NetworkError') {
      throw new Error('NFC 태그와 연결할 수 없습니다. 태그를 가까이 대주세요.');
    } else {
      throw error;
    }
  }
}

/**
 * 스캔 중지
 */
export function stopNFCScan() {
  isScanning = false;
  ndefReader = null;
}

/**
 * 현재 스캔 중인지 확인
 * @returns {boolean}
 */
export function isScanningNFC() {
  return isScanning;
}
